import Fastify, { FastifyInstance } from 'fastify';
import { registerFyersPlugin } from './fyers';

type MockFyersInstance = {
  setAppId: jest.Mock;
  setRedirectUrl: jest.Mock;
  setAccessToken: jest.Mock;
  get_profile: jest.Mock;
};

const fyersInstances: MockFyersInstance[] = [];

jest.mock('fyers-api-v3', () => ({
  fyersModel: class MockFyersModel {
    readonly setAppId = jest.fn();
    readonly setRedirectUrl = jest.fn();
    readonly setAccessToken = jest.fn();
    readonly get_profile = jest.fn().mockResolvedValue({ s: 'ok' });
    readonly place_order = jest.fn();
    readonly generateAuthCode = jest
      .fn()
      .mockReturnValue('https://example.test/login');
    readonly generate_access_token = jest.fn();
    readonly logout_user = jest.fn();
    readonly get_positions = jest.fn();
    readonly getOptionChain = jest.fn();
    readonly getHistory = jest.fn();

    constructor() {
      fyersInstances.push(this);
    }

    async initialize(): Promise<void> {
      // overridden by the plugin in tests
    }

    async isTokenValid(): Promise<boolean> {
      return false;
    }

    async getAccessToken(): Promise<string> {
      return '';
    }
  },
}));

function createJwt(expiryOffsetSeconds: number): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    exp: Math.floor(Date.now() / 1000) + expiryOffsetSeconds,
  })}.signature`;
}

function buildServer(tokens: string[]): {
  server: FastifyInstance;
  findOne: jest.Mock;
} {
  const findOne = jest
    .fn()
    .mockImplementationOnce(async (query?: { _id?: string }) =>
      query?._id === 'latest' && tokens.length > 0
        ? { _id: 'latest', token: tokens.shift() as string, timestamp: Date.now() }
        : null,
    )
    .mockImplementation(async () =>
      tokens.length > 0
        ? { token: tokens.shift() as string, timestamp: Date.now() }
        : null,
    );

  const server = Fastify({ logger: false });
  server.decorate('mongo', {
    client: {} as never,
    ObjectId: class {} as never,
    db: {
      collection: jest.fn().mockReturnValue({ findOne }),
    } as never,
  });

  return { server, findOne };
}

describe('registerFyersPlugin', () => {
  let server: FastifyInstance | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
    fyersInstances.splice(0, fyersInstances.length);
    jest.clearAllMocks();
  });

  it('does not run Fyers session checks for unrelated /api routes', async () => {
    const setup = buildServer([createJwt(300)]);
    server = setup.server;
    await registerFyersPlugin(server);
    server.get('/api/ping', async () => ({ ok: true }));
    await server.ready();

    const response = await server.inject({ method: 'GET', url: '/api/ping' });

    expect(response.statusCode).toBe(200);
    expect(setup.findOne).not.toHaveBeenCalled();
  });

  it('memoizes token fetches and verified session checks', async () => {
    const setup = buildServer([createJwt(300)]);
    server = setup.server;
    await registerFyersPlugin(server);
    await server.ready();

    await expect(server.fyers.getAccessToken()).resolves.toBeTruthy();
    await expect(server.fyers.getAccessToken()).resolves.toBeTruthy();
    await expect(server.ensureFyersSession()).resolves.toBe(true);
    await expect(server.ensureFyersSession()).resolves.toBe(true);
    await expect(server.ensureFyersSession({ verifyWithApi: true })).resolves.toBe(
      true,
    );
    await expect(server.ensureFyersSession({ verifyWithApi: true })).resolves.toBe(
      true,
    );

    expect(setup.findOne).toHaveBeenCalledTimes(1);
    expect(fyersInstances.at(-1)?.get_profile).toHaveBeenCalledTimes(1);
  });

  it('treats expired tokens as invalid until a fresh token is set', async () => {
    const setup = buildServer([createJwt(-60)]);
    server = setup.server;
    await registerFyersPlugin(server);
    await server.ready();

    await expect(server.fyers.isTokenValid()).resolves.toBe(false);
    await expect(server.ensureFyersSession()).resolves.toBe(false);
    const callsBeforeFreshToken = setup.findOne.mock.calls.length;

    server.fyers.setAccessToken(createJwt(300));

    await expect(server.fyers.isTokenValid()).resolves.toBe(true);
    await expect(server.ensureFyersSession()).resolves.toBe(true);
    expect(setup.findOne).toHaveBeenCalledTimes(callsBeforeFreshToken);
  });
});
