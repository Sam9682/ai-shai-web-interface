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

  describe('loadStaticContent', () => {
    it('issues GET /prerequisites/{slug}/content and returns response.data', async () => {
      const payload = { slug: 'basics', content: '<html>x</html>' };
      mockedApi.get.mockResolvedValueOnce({ data: payload });

      const result = await prerequisitesService.loadStaticContent('basics');

      expect(mockedApi.get).toHaveBeenCalledTimes(1);
      expect(mockedApi.get).toHaveBeenCalledWith('/prerequisites/basics/content');
      expect(mockedApi.put).not.toHaveBeenCalled();
      expect(result).toEqual(payload);
    });
  });

  describe('saveStaticContent', () => {
    it('issues PUT /prerequisites/{slug}/content with { content } body', async () => {
      await prerequisitesService.saveStaticContent('basics', '<html>');

      expect(mockedApi.put).toHaveBeenCalledTimes(1);
      expect(mockedApi.put).toHaveBeenCalledWith('/prerequisites/basics/content', {
        content: '<html>',
      });
      expect(mockedApi.get).not.toHaveBeenCalled();
    });
  });

  describe('loadClientAnswers', () => {
    it('issues GET /prerequisites/{slug}/answers and returns response.data', async () => {
      const payload = { slug: 'vcf', answers: { 'row-1': 'val' } };
      mockedApi.get.mockResolvedValueOnce({ data: payload });

      const result = await prerequisitesService.loadClientAnswers('vcf');

      expect(mockedApi.get).toHaveBeenCalledTimes(1);
      expect(mockedApi.get).toHaveBeenCalledWith('/prerequisites/vcf/answers');
      expect(mockedApi.put).not.toHaveBeenCalled();
      expect(result).toEqual(payload);
    });
  });

  describe('saveClientAnswer', () => {
    it('issues PUT /prerequisites/{slug}/answers/{rowId} with { answer } body', async () => {
      await prerequisitesService.saveClientAnswer('vcf', 'row-1', 'val');

      expect(mockedApi.put).toHaveBeenCalledTimes(1);
      expect(mockedApi.put).toHaveBeenCalledWith('/prerequisites/vcf/answers/row-1', {
        answer: 'val',
      });
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
    await prerequisitesService.loadStaticContent('basics');
    await prerequisitesService.saveStaticContent('basics', '<html>');
    await prerequisitesService.loadClientAnswers('vcf');
    await prerequisitesService.saveClientAnswer('vcf', 'row-1', 'val');

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });
});
