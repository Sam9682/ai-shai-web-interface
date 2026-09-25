import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The service imports the default axios instance from './api' and calls
// `.get`/`.put` on it. We replace that module with a stub whose methods we can
// assert against, so these are pure contract tests (HTTP verb, path, body)
// with no live backend.
vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

// Import after the mock is registered so the service binds to the stub.
import api from './api';
import { prerequisitesService } from './prerequisitesService';

const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  mockedApi.get.mockReset();
  mockedApi.put.mockReset();
  // Default resolutions so `response.data` reads don't throw.
  mockedApi.get.mockResolvedValue({ data: {} });
  mockedApi.put.mockResolvedValue({ data: {} });
});

describe('prerequisitesService contract', () => {
  // _Requirements: 6.2 (load through service), 4.4 & 5.7 (save through service)_

  const INSTALL_ID = '11111111-1111-1111-1111-111111111111';

  describe('loadStaticContent', () => {
    it('issues GET /prerequisites/installations/{installationId}/{slug}/content and returns response.data', async () => {
      const payload = { slug: 'basics', content: '<html>x</html>' };
      mockedApi.get.mockResolvedValueOnce({ data: payload });

      const result = await prerequisitesService.loadStaticContent(INSTALL_ID, 'basics');

      expect(mockedApi.get).toHaveBeenCalledTimes(1);
      expect(mockedApi.get).toHaveBeenCalledWith(
        `/prerequisites/installations/${INSTALL_ID}/basics/content`,
      );
      expect(mockedApi.put).not.toHaveBeenCalled();
      expect(result).toEqual(payload);
    });
  });

  describe('saveStaticContent', () => {
    it('issues PUT /prerequisites/installations/{installationId}/{slug}/content with { content } body', async () => {
      await prerequisitesService.saveStaticContent(INSTALL_ID, 'basics', '<html>');

      expect(mockedApi.put).toHaveBeenCalledTimes(1);
      expect(mockedApi.put).toHaveBeenCalledWith(
        `/prerequisites/installations/${INSTALL_ID}/basics/content`,
        { content: '<html>' },
      );
      expect(mockedApi.get).not.toHaveBeenCalled();
    });
  });

  describe('loadClientAnswers', () => {
    it('issues GET /prerequisites/installations/{installationId}/{slug}/answers and returns response.data', async () => {
      const payload = { slug: 'vcf', answers: { 'row-1': 'val' } };
      mockedApi.get.mockResolvedValueOnce({ data: payload });

      const result = await prerequisitesService.loadClientAnswers(INSTALL_ID, 'vcf');

      expect(mockedApi.get).toHaveBeenCalledTimes(1);
      expect(mockedApi.get).toHaveBeenCalledWith(
        `/prerequisites/installations/${INSTALL_ID}/vcf/answers`,
      );
      expect(mockedApi.put).not.toHaveBeenCalled();
      expect(result).toEqual(payload);
    });
  });

  describe('saveClientAnswer', () => {
    it('issues PUT /prerequisites/installations/{installationId}/{slug}/answers/{rowId} with { answer } body', async () => {
      await prerequisitesService.saveClientAnswer(INSTALL_ID, 'vcf', 'row-1', 'val');

      expect(mockedApi.put).toHaveBeenCalledTimes(1);
      expect(mockedApi.put).toHaveBeenCalledWith(
        `/prerequisites/installations/${INSTALL_ID}/vcf/answers/row-1`,
        { answer: 'val' },
      );
      expect(mockedApi.get).not.toHaveBeenCalled();
    });
  });
});

describe('prerequisitesService does not touch localStorage (Req 6.4)', () => {
  let getItemSpy: ReturnType<typeof vi.spyOn>;
  let setItemSpy: ReturnType<typeof vi.spyOn>;
  let removeItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
  });

  afterEach(() => {
    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
    removeItemSpy.mockRestore();
  });

  it('performs no localStorage reads or writes across every method', async () => {
    const installId = '11111111-1111-1111-1111-111111111111';
    await prerequisitesService.loadStaticContent(installId, 'basics');
    await prerequisitesService.saveStaticContent(installId, 'basics', '<html>');
    await prerequisitesService.loadClientAnswers(installId, 'vcf');
    await prerequisitesService.saveClientAnswer(installId, 'vcf', 'row-1', 'val');

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });
});
