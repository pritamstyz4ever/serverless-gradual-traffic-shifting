const { expect } = require('chai');
const _ = require('lodash/fp');
const ApiGateway = require('./ApiGateway');

describe('ApiGateway', () => {
  const apiGatewayMethod = {
    Type: 'AWS::ApiGateway::Method',
    Properties: {
      HttpMethod: 'GET',
      ResourceId: { Ref: 'ApiGatewayResourceId' },
      RestApiId: { Ref: 'ApiGatewayRestApi' },
      Integration: {
        IntegrationHttpMethod: 'POST',
        Type: 'AWS_PROXY',
        Uri: {
          'Fn::Join': [
            '',
            [
              'arn:aws:apigateway:',
              { Ref: 'AWS::Region' },
              ':lambda:path/2015-03-31/functions/',
              { 'Fn:GetAtt': [ 'HelloLambdaFunction', 'Arn' ] },
              '/invocations'
            ]
          ]
        }
      },
      MethodResponses: []
    }
  };

  describe('.replaceMethodUriWithAlias', () => {
    it('replaces the method URI with a function alias ARN', () => {
      const functionAlias = 'TheFunctionAlias';
      const uriWithAwsVariables = [
        'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${',
        functionAlias,
        '}/invocations'
      ].join('');
      const uri = { 'Fn::Sub': uriWithAwsVariables };
      const expected = _.set('Properties.Integration.Uri', uri, apiGatewayMethod);
      const actual = ApiGateway.replaceMethodUriWithAlias(apiGatewayMethod, functionAlias);
      expect(actual).to.deep.equal(expected);
    });
  });
});
