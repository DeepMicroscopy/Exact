import { TestBed } from '@angular/core/testing';

import { HomeResolverService } from './home-resolver.service';

describe('HomeResolverService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: HomeResolverService = TestBed.get(HomeResolverService);
    expect(service).toBeTruthy();
  });
});
