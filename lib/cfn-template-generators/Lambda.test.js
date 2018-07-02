const { expect } = require('chai');
const _ = require('lodash/fp');
const Lambda = require('./Lambda');

describe('Lambda', () => {
  describe('.buildAlias', () => {
    const functionName = 'MyFunctionName';
    const functionVersion = 'MyFunctionVersion';
    const alias = 'live';
    const liveVersion = 2;
    const versionWeight = 0.02;
    const baseAlias = {
      Type: 'AWS::Lambda::Alias',
      Properties: {
        FunctionVersion: { 'Fn::GetAtt': [functionVersion, 'Version'] },
        FunctionName: { Ref: functionName },
        Name: alias
      }
    };

    it('should generate a AWS::Lambda::Alias resouce', () => {
      const expected = baseAlias;
      const actual = Lambda.buildAlias({ alias, functionName, functionVersion, undefined, liveVersion });
      expect(actual).to.deep.equal(expected);
    });

    context('when versionWeight is provided', () => {
      it('when liveVersion does not exist', () => {
        const expected = baseAlias;
        const actual = Lambda.buildAlias({ alias, functionName, functionVersion });
        expect(actual).to.deep.equal(expected);
      });

      it('should include RoutingConfig when liveVersion exists', () => {
        const routeConfig = {
          AdditionalVersionWeights: [{
            FunctionVersion: liveVersion, // { 'Fn::GetAtt': [functionVersion, 'Version'] },
            FunctionWeight: 0.98
          }]
        };
        const expected = _.set('Properties.RoutingConfig', routeConfig, baseAlias);
        const actual = Lambda.buildAlias({ alias, functionName, functionVersion, versionWeight, liveVersion });
        expect(actual).to.deep.include(expected);
      });
    });
  });

  describe('.replacePermissionFunctionWithAlias', () => {
    const lambdaPermission = {
      Type: 'AWS::Lambda::Permission',
      Properties: {
        FunctionName: { 'Fn::GetAtt': ['HelloLambdaFunctionAliasLive', 'Arn'] },
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: {
          'Fn::Join': [
            '',
            [
              'arn:aws:execute-api:',
              { Ref: 'AWS::Region' },
              ':',
              { Ref: 'AWS::AccountId' },
              ':',
              { Ref: 'ApiGatewayRestApi' },
              '/*/*'
            ]
          ]
        }
      }
    };

    it('replaces the permission\'s function for an alias', () => {
      const functionAlias = 'TheFunctionAlias';
      const permissionFunctionWithAlias = { Ref: functionAlias };
      const expected = _.set('Properties.FunctionName', permissionFunctionWithAlias, lambdaPermission);
      const actual = Lambda.replacePermissionFunctionWithAlias(lambdaPermission, functionAlias);
      expect(actual).to.deep.equal(expected);
    });
  });

  describe('.replaceEventMappingFunctionWithAlias', () => {
    const eventSourceMapping = {
      Type: 'AWS::Lambda::EventSourceMapping',
      DependsOn: 'IamRoleLambdaExecution',
      Properties: {
        BatchSize: 10,
        EventSourceArn: { 'Fn::GetAtt': ['StreamsTestTable', 'StreamArn'] },
        FunctionName: { 'Fn::GetAtt': ['HelloLambdaFunction', 'Arn'] },
        StartingPosition: 'TRIM_HORIZON',
        Enabled: 'True'
      }
    };

    it('replaces the event source mapping\'s function for an alias', () => {
      const functionAlias = 'TheFunctionAlias';
      const eventMappingFunctionWithAlias = { Ref: functionAlias };
      const expected = _.set('Properties.FunctionName', eventMappingFunctionWithAlias, eventSourceMapping);
      const actual = Lambda.replaceEventMappingFunctionWithAlias(eventSourceMapping, functionAlias);
      expect(actual).to.deep.equal(expected);
    });
  });
});
