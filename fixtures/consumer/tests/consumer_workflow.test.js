import { describe, it, expect, vi, afterEach } from 'vitest';
import { createUser, loadUser } from '../src/user.mjs';
import { createStrictFetchMock } from '../../../templates/strict-fetch.mock.mjs';

afterEach(() => vi.unstubAllGlobals());

describe('real consumer business path with strict external boundary mocks', () => {
  it('runs real createUser + real validateEmail collaboration', () => {
    expect(createUser(' USER@example.com ')).toEqual({email:'user@example.com'});
    expect(() => createUser('invalid')).toThrow('Invalid email');
  });
  it('uses real loadUser and handles a valid API response', async () => {
    const api=createStrictFetchMock();
    api.when('GET','/api/users/7',{type:'json',status:200,body:{id:7}});
    vi.stubGlobal('fetch',api.fetch);
    expect(await loadUser(7)).toEqual({id:7});
    expect(api.fetch).toHaveBeenCalledOnce();
  });
  it.each([400,401,403,404,500,503])('handles HTTP %s without treating it as a network rejection', async status => {
    const api=createStrictFetchMock();
    api.when('GET','/api/users/7',{type:'http_error',status,body:{message:'error'}});
    vi.stubGlobal('fetch',api.fetch);
    await expect(loadUser(7)).rejects.toThrow(`HTTP ${status}`);
  });
  it('propagates an unavailable URL / network error', async () => {
    const api=createStrictFetchMock();
    api.when('GET','/api/users/7',{type:'network_error'});
    vi.stubGlobal('fetch',api.fetch);
    await expect(loadUser(7)).rejects.toThrow(/network failure/);
  });
  it('propagates aborted requests and invalid API JSON', async () => {
    const api=createStrictFetchMock();
    api.when('GET','/api/users/7',{type:'timeout'});
    vi.stubGlobal('fetch',api.fetch);
    await expect(loadUser(7)).rejects.toMatchObject({name:'AbortError'});
    api.when('GET','/api/users/7',{type:'invalid_json'});
    await expect(loadUser(7)).rejects.toThrow();
  });
  it('rejects an unconfigured API route rather than returning undefined', async () => {
    const api=createStrictFetchMock();
    vi.stubGlobal('fetch',api.fetch);
    await expect(loadUser(7)).rejects.toThrow(/unconfigured request/);
  });
});
