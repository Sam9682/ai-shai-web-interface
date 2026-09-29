# Bugfix Requirements Document

## Introduction

Clicking the "RETRIEVE INFO" button in the prerequisites web interface fails with an
OpenStack connection error. The backend performs a two-step OpenStack flow
(Keystone token acquisition, then a Nova server list) via
`app/prerequisites/openstack.py`, using `httpx.AsyncClient`. In the target
environment, the OpenStack API (Keystone and Nova) is reachable **only** through
an HTTP/HTTPS forward proxy (`http://51.178.90.72:9999/`).

The outbound calls in `OpenStackProxy._get_token` and `OpenStackProxy._list_servers`
create `httpx.AsyncClient(verify=verify)` without any explicit proxy
configuration. As a result the requests attempt a direct connection to the
Keystone/Nova hosts, which is not routable, and httpx raises `httpx.ConnectError`.
This is mapped to `OpenStackConnectionError` → HTTP 502, and the UI surfaces
"Unable to reach OpenStack. Check the network and the URLs."

Observed logs:

```
OPCP - ERROR - OpenStack token request connection failure: ConnectError
app.prerequisites.router - ERROR - OpenStack connection failed for installation_id=8d3f09fb-...
```

The fix is to route the OpenStack outbound HTTP calls through the configured
proxy so that Keystone and Nova become reachable, while leaving behavior
unchanged in environments where no proxy is configured.

## Bug Analysis

### Current Behavior (Defect)

When OpenStack is only reachable via a forward proxy, the OpenStack HTTP client
does not use that proxy and cannot establish a connection.

1.1 WHEN a proxy is configured in the environment AND the user clicks "RETRIEVE INFO" THEN the system opens `httpx.AsyncClient` without proxy configuration and attempts a direct connection to the Keystone token endpoint
1.2 WHEN the direct connection to Keystone cannot be established THEN the system raises `httpx.ConnectError`, logs "OpenStack token request connection failure: ConnectError", and returns HTTP 502 with code `CONNECTION_FAILED`
1.3 WHEN the token step is bypassed but Nova is only reachable via the proxy THEN the system attempts a direct connection to the Nova server-list endpoint and fails with the same connection error
1.4 WHEN the connection failure reaches the frontend THEN the UI displays "Unable to reach OpenStack. Check the network and the URLs." even though the URLs and credentials are valid and only the proxy routing is missing

### Expected Behavior (Correct)

The OpenStack HTTP calls route through the configured proxy so Keystone and Nova
become reachable.

2.1 WHEN a proxy is configured AND the user clicks "RETRIEVE INFO" THEN the system SHALL send the Keystone token request through the configured proxy
2.2 WHEN a proxy is configured AND the token request succeeds THEN the system SHALL send the Nova server-list request through the same configured proxy
2.3 WHEN both proxied requests succeed THEN the system SHALL return the mapped `{id, name, status}` server rows and the UI SHALL display the retrieved servers instead of a connection error
2.4 WHEN a proxied request still fails to connect (proxy unreachable or upstream down) THEN the system SHALL continue to raise `OpenStackConnectionError` → HTTP 502 without leaking the credential secret or Keystone token in logs, messages, or response bodies

### Unchanged Behavior (Regression Prevention)

3.1 WHEN no proxy is configured THEN the system SHALL CONTINUE TO perform the Keystone and Nova calls with direct connections exactly as before
3.2 WHEN OpenStack rejects the credentials (401/403) THEN the system SHALL CONTINUE TO raise `OpenStackAuthError` → HTTP 401 with code `AUTH_FAILED`
3.3 WHEN a non-empty CA certificate is supplied THEN the system SHALL CONTINUE TO build and apply the same TLS verification context for both calls, and SHALL CONTINUE TO raise `OpenStackCACertificateError` for invalid PEM before any network call
3.4 WHEN OpenStack returns a non-auth error status or an unreadable body THEN the system SHALL CONTINUE TO raise `OpenStackServiceError` → HTTP 502 with code `OPENSTACK_ERROR`
3.5 WHEN any OpenStack call runs THEN the system SHALL CONTINUE TO keep the credential secret and Keystone token in local variables only, never logging or returning them
