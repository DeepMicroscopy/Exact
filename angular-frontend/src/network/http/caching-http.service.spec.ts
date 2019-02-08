import { TestBed } from '@angular/core/testing';

import { CachingHttpClient } from './caching-http.service';

describe('CachingHttpClient', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: CachingHttpClient = TestBed.get(CachingHttpClient);
    expect(service).toBeTruthy();
  });
});
