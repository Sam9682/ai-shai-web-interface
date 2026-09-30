# Bugfix Requirements Document

## Introduction

When the frontend is served through the nginx reverse proxy (HTTPS port 8524), the browser intermittently fails to load the main JS module. Roughly every other request for a hashed JS asset returns a 404 with `text/html` content, triggering the browser error "Loading module ... was blocked because of a disallowed MIME type (text/html)" and rendering an empty page.

The root cause is a shared, fixed Docker network name. All per-`USER_ID` deployments join one external network hardcoded as `name: shai-network` in `docker-compose.yml`. Because the network name is identical across every compose project, Docker's embedded DNS resolves the service name `frontend` to `frontend` containers belonging to OTHER deployments on the same network. The reverse proxy upstream `server frontend:8001;` therefore round-robins between multiple deployments' frontends. A frontend from a different deployment ships a different build and does not have the requesting deployment's hashed asset, so it returns its SPA `index.html` fallback (`text/html`) with a 404 — producing the alternating 404/200 pattern and the intermittent MIME error.

The fix scopes the network name per deployment (`name: shai-network-${USER_ID:-1}`) while keeping the compose-internal alias `shai-network` that services reference, so `frontend` resolves only within each deployment's own isolated network.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a hashed JS asset is requested through the reverse proxy (port 8524) AND multiple `USER_ID` deployments share the fixed `shai-network` THEN the system round-robins the `frontend` upstream across deployments and returns 404 with `text/html` for requests routed to a foreign deployment's frontend

1.2 WHEN the browser attempts to load the main JS module and the response is the SPA `index.html` fallback (MIME `text/html`) THEN the system causes the browser to block the module with a disallowed MIME type error and render an empty page

1.3 WHEN the Docker network is declared with the fixed `name: shai-network` THEN the system allows the service name `frontend` to resolve to containers belonging to other deployments on the same network

### Expected Behavior (Correct)

2.1 WHEN a hashed JS asset is requested through the reverse proxy (port 8524) with multiple `USER_ID` deployments running THEN the system SHALL route every request to the frontend of the same deployment and return the correct asset with a 200 status and the correct JS MIME type

2.2 WHEN the browser loads the main JS module through the reverse proxy THEN the system SHALL serve the requested hashed asset so the module loads successfully and the page renders

2.3 WHEN the Docker network is declared THEN the system SHALL use a per-deployment unique network name (`name: shai-network-${USER_ID:-1}`) so the service name `frontend` resolves only within its own deployment's isolated network

### Unchanged Behavior (Regression Prevention)

3.1 WHEN requests hit the frontend container directly (port 8529) THEN the system SHALL CONTINUE TO serve the requested asset reliably with a 200 status

3.2 WHEN services within a single deployment reference the `shai-network` alias THEN the system SHALL CONTINUE TO resolve inter-service names (`frontend`, `ai-shai-web-interface`, database, etc.) correctly within that deployment

3.3 WHEN only a single deployment is running THEN the system SHALL CONTINUE TO serve frontend assets through the reverse proxy without error

## Bug Condition and Properties

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ProxyAssetRequest
  OUTPUT: boolean

  // A request triggers the bug when it is routed through the reverse proxy
  // while more than one deployment shares the same fixed Docker network name,
  // making the `frontend` service name ambiguous across deployments.
  RETURN X.viaReverseProxy = true
     AND X.dockerNetworkName is shared/fixed across deployments
     AND countDeploymentsOnNetwork(X.dockerNetworkName) > 1
END FUNCTION
```

### Property: Fix Checking

```pascal
// For all buggy inputs, the fixed configuration must route to the
// same deployment's frontend and return the correct asset.
FOR ALL X WHERE isBugCondition(X) DO
  result ← serveAsset'(X)
  ASSERT result.status = 200
     AND result.contentType = "application/javascript"
     AND result.servedBy = sameDeploymentFrontend(X)
END FOR
```

### Property: Preservation Checking

```pascal
// For all non-buggy inputs (e.g. direct-to-container requests, single
// deployment, intra-deployment DNS), the fixed configuration behaves
// identically to the original.
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

Where **F** is the deployment using the fixed `name: shai-network` and **F'** is the deployment using the per-deployment `name: shai-network-${USER_ID:-1}`.
