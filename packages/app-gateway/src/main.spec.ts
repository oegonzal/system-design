import { GatewayConfigError } from './config';
import { idle, job, proxy } from './main';
import { functionUrlEvent } from './testing';

/**
 * The three handlers the Lambda runtime names, `main.proxy`, `main.idle`
 * and `main.job`. The suite runs with every gateway variable blanked, so
 * each is wired on its first call and refuses its configuration by name —
 * which is the whole path from the environment to the handler, with no AWS
 * reached.
 */
describe('the Lambda handlers', () => {
  it('exports proxy, idle and job, each wired on first use from the environment', async () => {
    expect(typeof proxy).toBe('function');
    expect(typeof idle).toBe('function');
    expect(typeof job).toBe('function');
    await expect(proxy(functionUrlEvent())).rejects.toThrow(
      new GatewayConfigError('GATEWAY_ROUTES must be set'),
    );
    await expect(idle()).rejects.toThrow(GatewayConfigError);
    await expect(job({ launch: 'linkedin' })).rejects.toThrow(
      new GatewayConfigError('GATEWAY_ECS_CLUSTER must be set'),
    );
  });
});
