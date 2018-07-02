const _ = require('lodash/fp');

function buildAlias({ alias, functionName, functionVersion, versionWeight, liveVersion }) {
  const lambdaAlias = {
    Type: 'AWS::Lambda::Alias',
    Properties: {
      FunctionVersion: { 'Fn::GetAtt': [functionVersion, 'Version'] },
      FunctionName: { Ref: functionName },
      Name: alias
    }
  };
  if (versionWeight) {
    const routingConfig = {
      AdditionalVersionWeights: [
        {
          FunctionVersion: liveVersion,
          FunctionWeight: 1 - versionWeight
        }]
    };
    Object.assign(lambdaAlias.Properties, { RoutingConfig: routingConfig });
  }
  return lambdaAlias;
}

function replacePermissionFunctionWithAlias(lambdaPermission, functionAlias) {
  const newPermission = _.set('Properties.FunctionName', { Ref: functionAlias }, lambdaPermission);
  return newPermission;
}

function replaceEventMappingFunctionWithAlias(eventSourceMapping, functionAlias) {
  const newMapping = _.set('Properties.FunctionName', { Ref: functionAlias }, eventSourceMapping);
  return newMapping;
}

const Lambda = {
  buildAlias,
  replacePermissionFunctionWithAlias,
  replaceEventMappingFunctionWithAlias
};

module.exports = Lambda;
