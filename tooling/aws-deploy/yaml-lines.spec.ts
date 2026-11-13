import { describe, expect, it } from 'vitest';

import {
  environmentValue,
  exportedResource,
  namesIn,
  namesWhole,
  parameterDefault,
  prefixedNames,
  resourcesOfType,
} from './templates';
import {
  blockOf,
  blocksOf,
  fieldOf,
  keysOf,
  scalarOf,
  scalarOrSub,
  sequenceItems,
  sequenceOf,
  yamlLines,
} from './yaml-lines';

/**
 * The line-based YAML reader the AWS specs rest on, and the template readers
 * built on it, each proven on a template written the way infra/aws writes
 * them: block mappings and sequences, flow forms, block scalars, `!Sub` in
 * both of its forms, a sequence item's own key against a nested one.
 */
const TEMPLATE = `
Parameters:
  # A comment, not a line.
  GatewayRoutes:
    Type: String
    Default: '[{"prefix":"/api","port":3000}]'
  JobSchedulesState:
    Default: 'DISABLED'
  Folded:
    Default: >-
      one
      two
Resources:
  Task:
    Type: AWS::ECS::TaskDefinition
    Properties:
      ContainerDefinitions:
        - Name: api
          Command: ['serve', "it's on"]
          PortMappings:
            - ContainerPort: 3000
          HealthCheck:
            Command: ['CMD-SHELL', 'wget -qO- http://127.0.0.1:3000/api/health || exit 1']
          Secrets:
            - { Name: DB_PASSWORD, ValueFrom: x }
        - Essential: true
          Name: ui
          Command:
            - start
          Environment:
            - Name: PORT
              Value: '4200'
            - Name: LOOP_URL
              Value: !Sub
                - 'http://app.\${Namespace}:3003'
                - Namespace: !ImportValue 'sysdesign-prod-NamespaceName'
            - Name: SERVICE
              Value: !Sub '\${AWS::StackName}-app'
  Job:
    Type: AWS::Lambda::Function
    Metadata:
      cfn-lint:
        config:
          ignore_checks: [W3002]
    Properties:
      Handler: main.job
  Nightly:
    Type: AWS::Scheduler::Schedule
    Properties:
      State: !Ref JobSchedulesState
Outputs:
  SessionSecurityGroupId:
    Value: !Ref SessionSecurityGroup
    Export:
      Name: 'sysdesign-prod-SessionSecurityGroupId'
`;

describe('the line-based YAML reader', () => {
  const lines = yamlLines(TEMPLATE);
  const items = blocksOf(lines, 'ContainerDefinitions').flatMap(sequenceItems);

  it('reads keys, blocks, scalars and sequences by indentation', () => {
    const parameters = blockOf(lines, 'Parameters') ?? [];
    expect(keysOf(parameters)).toEqual(['GatewayRoutes', 'JobSchedulesState', 'Folded']);
    expect(scalarOf(blockOf(parameters, 'GatewayRoutes') ?? [], 'Default')).toBe(
      '[{"prefix":"/api","port":3000}]',
    );
    expect(scalarOf(blockOf(parameters, 'Folded') ?? [], 'Default')).toBe('one two');
    expect(items.map((item) => scalarOf(item, 'Name'))).toEqual(['api', 'ui']);
    expect(scalarOf(blockOf(items[0] ?? [], 'PortMappings') ?? [], 'ContainerPort')).toBe('3000');
    expect(namesIn(blockOf(items[0] ?? [], 'Secrets') ?? [])).toEqual(['DB_PASSWORD']);
    expect(namesIn(blockOf(items[1] ?? [], 'Environment') ?? [])).toEqual([
      'PORT',
      'LOOP_URL',
      'SERVICE',
    ]);
    expect(
      fieldOf(sequenceItems(blockOf(items[1] ?? [], 'Environment') ?? [])[0] ?? [], 'Value'),
    ).toBe('4200');
  });

  it('reads a sequence item’s own key, never a nested entry’s, and flow or block sequences alike', () => {
    // `ui` carries `Name` on its second line and an environment entry named
    // PORT below it; the item's own Name is the one at its depth.
    expect(scalarOf(items[1] ?? [], 'Name')).toBe('ui');
    expect(blockOf(items[1] ?? [], 'Environment')?.length).toBe(8);
    expect(sequenceOf(items[0] ?? [], 'Command')).toEqual(['serve', "it's on"]);
    expect(sequenceOf(items[1] ?? [], 'Command')).toEqual(['start']);
    expect(sequenceOf(items[0] ?? [], 'Image')).toBeUndefined();
    expect(sequenceOf(blockOf(items[0] ?? [], 'HealthCheck') ?? [], 'Command')).toEqual([
      'CMD-SHELL',
      'wget -qO- http://127.0.0.1:3000/api/health || exit 1',
    ]);
  });

  it('unwraps a !Sub in either form to its template string and leaves other tags as written', () => {
    const ui = items[1] ?? [];
    expect(environmentValue(ui, 'LOOP_URL')).toBe('http://app.${Namespace}:3003');
    expect(environmentValue(ui, 'SERVICE')).toBe('${AWS::StackName}-app');
    expect(environmentValue(ui, 'PORT')).toBe('4200');
    expect(environmentValue(ui, 'ABSENT')).toBeUndefined();
    const nightly = resourcesOfType(TEMPLATE, 'AWS::Scheduler::Schedule')[0];
    expect(nightly?.name).toBe('Nightly');
    expect(scalarOrSub(nightly?.properties ?? [], 'State')).toBe('!Ref JobSchedulesState');
  });

  it('finds resources by type past their metadata, a parameter’s default and an export’s resource', () => {
    const [job] = resourcesOfType(TEMPLATE, 'AWS::Lambda::Function');
    expect(job?.name).toBe('Job');
    expect(scalarOf(job?.properties ?? [], 'Handler')).toBe('main.job');
    expect(resourcesOfType(TEMPLATE, 'AWS::ECS::TaskDefinition').map(({ name }) => name)).toEqual([
      'Task',
    ]);
    expect(parameterDefault(TEMPLATE, 'JobSchedulesState')).toBe('DISABLED');
    expect(parameterDefault(TEMPLATE, 'Missing')).toBeUndefined();
    expect(exportedResource(TEMPLATE, 'sysdesign-prod-SessionSecurityGroupId')).toBe(
      'SessionSecurityGroup',
    );
    expect(exportedResource(TEMPLATE, 'sysdesign-prod-Other')).toBeUndefined();
  });

  it('expands prefixed names through parameter defaults and drops policy scopes', () => {
    const names = prefixedNames(`
Parameters:
  SecretsPrefix:
    Default: /sysdesign/prod
  IdleStateParameterName:
    Default: /sysdesign/prod/idle-state
Resources:
  Role:
    Resource: !Sub 'arn:aws:ssm:*:parameter\${SecretsPrefix}/*'
  Group:
    LogGroupName: /sysdesign/prod/app
  Task:
    ValueFrom: !Sub '\${SecretsPrefix}/notifications/TELEGRAM_CHAT_ID'
    Other: !Ref IdleStateParameterName
`);
    expect(names.sort()).toEqual([
      '/sysdesign/prod/app',
      '/sysdesign/prod/idle-state',
      '/sysdesign/prod/notifications/TELEGRAM_CHAT_ID',
    ]);
    // A document that names only the longer `/sysdesign/prod/app-gateway` has not named `/sysdesign/prod/app`.
    expect(namesWhole('reads `/sysdesign/prod/app-gateway`', '/sysdesign/prod/app')).toBe(false);
    expect(namesWhole('reads `/sysdesign/prod/app`.', '/sysdesign/prod/app')).toBe(true);
  });
});
