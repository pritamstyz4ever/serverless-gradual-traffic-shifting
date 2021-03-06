const _ = require('lodash/fp');
const flattenObject = require('flat');
const CfnTemplateGenerators = require('./lib/cfn-template-generators');

class ServerlessGradualTrafficShifting {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.awsProvider = this.serverless.getProvider('aws');
    this.naming = this.awsProvider.naming;
    this.service = this.serverless.service;
    this.commands = {
      log: {
        lifecycleEvents: [
          'serverless'
        ]
      }
    };
    this.hooks = {
      'before:package:finalize': () => this.addLambdaTrafficShiftingResources(this)
    };
    this.serverless.cli.log('Invoke plugin Serverless Gradual Deployment');
  }

  get compiledTemplate() {
    return this.service.provider.compiledCloudFormationTemplate;
  }

  get withDeploymentPreferencesFns() {
    return this.serverless.service.getAllFunctions()
      .filter(name => _.has('deploymentSettings', this.service.getFunction(name)));
  }

  get globalSettings() {
    return _.pathOr({}, 'custom.deploymentSettings', this.service);
  }

  get currentStage() {
    return this.awsProvider.getStage();
  }

  addLambdaTrafficShiftingResources() {
    this.serverless.cli.log('Invoke traffic shift resource creation');
    if (this.shouldDeployGradually()) {
      const functionsResources = this.buildFunctionsResources();
      Object.assign(
        this.compiledTemplate.Resources,
        ...functionsResources
      );
      this.serverless.cli.log('Completed invoking traffic shift resource creation');
    }
  }

  shouldDeployGradually() {
    return this.withDeploymentPreferencesFns.length > 0 && this.currentStageEnabled();
  }

  currentStageEnabled() {
    const enabledStages = _.getOr([], 'stages', this.globalSettings);
    return _.isEmpty(enabledStages) || _.includes(this.currentStage, enabledStages);
  }

  buildFunctionsResources() {
    const resources = _.flatMap(
      serverlessFunction => this.buildFunctionResources(serverlessFunction),
      this.withDeploymentPreferencesFns
    );
    return resources;
  }

  buildFunctionResources(serverlessFnName) {
    const functionName = this.naming.getLambdaLogicalId(serverlessFnName);
    const deploymentSettings = this.getDeploymentSettingsFor(serverlessFnName);
    const aliasTemplate = this.buildFunctionAlias({ deploymentSettings, functionName });
    const functionAlias = this.getResourceLogicalName(aliasTemplate);
    const lambdaPermissions = this.buildPermissionsForAlias({ functionName, functionAlias });
    const eventsWithAlias = this.buildEventsForAlias({ functionName, functionAlias });
    return ([aliasTemplate, ...lambdaPermissions, ...eventsWithAlias]);
  }

  buildFunctionAlias({ deploymentSettings = {}, functionName }) {
    this.serverless.cli.log('Creating Alias stack for the function');
    const { alias, liveVersion } = deploymentSettings;
    let { versionWeight } = deploymentSettings;
    if (!liveVersion) {
      versionWeight = undefined;
    }
    const functionVersion = this.getVersionNameFor(functionName);
    const logicalName = `${functionName}Alias${alias}`;
    const template = CfnTemplateGenerators.lambda.buildAlias({
      alias,
      functionName,
      functionVersion,
      versionWeight,
      liveVersion
    });
    // this.serverless.cli.log(JSON.stringify(template));
    return { [logicalName]: template };
  }

  getFunctionName(slsFunctionName) {
    return slsFunctionName ? this.naming.getLambdaLogicalId(slsFunctionName) : null;
  }

  buildPermissionsForAlias({ functionName, functionAlias }) {
    const permissions = this.getLambdaPermissionsFor(functionName);
    return _.entries(permissions).map(([logicalName, template]) => {
      const templateWithAlias = CfnTemplateGenerators.lambda
        .replacePermissionFunctionWithAlias(template, functionAlias);
      return { [logicalName]: templateWithAlias };
    });
  }

  buildEventsForAlias({ functionName, functionAlias }) {
    const replaceAliasStrategy = {
      'AWS::Lambda::EventSourceMapping': CfnTemplateGenerators.lambda.replaceEventMappingFunctionWithAlias,
      'AWS::ApiGateway::Method': CfnTemplateGenerators.apiGateway.replaceMethodUriWithAlias,
      'AWS::SNS::Topic': CfnTemplateGenerators.sns.replaceTopicSubscriptionFunctionWithAlias,
      'AWS::S3::Bucket': CfnTemplateGenerators.s3.replaceS3BucketFunctionWithAlias
    };
    const functionEvents = this.getEventsFor(functionName);
    const functionEventsEntries = _.entries(functionEvents);
    const eventsWithAlias = functionEventsEntries.map(([logicalName, event]) => {
      const evt = replaceAliasStrategy[event.Type](event, functionAlias, functionName);
      return { [logicalName]: evt };
    });
    return eventsWithAlias;
  }

  getEventsFor(functionName) {
    const apiGatewayMethods = this.getApiGatewayMethodsFor(functionName);
    const eventSourceMappings = this.getEventSourceMappingsFor(functionName);
    const snsTopics = this.getSnsTopicsFor(functionName);
    const s3Events = this.getS3EventsFor(functionName);
    return Object.assign({}, apiGatewayMethods, eventSourceMappings, snsTopics, s3Events);
  }

  getApiGatewayMethodsFor(functionName) {
    const isApiGMethod = _.matchesProperty('Type', 'AWS::ApiGateway::Method');
    const isMethodForFunction = _.pipe(
      _.prop('Properties.Integration'),
      flattenObject,
      _.includes(functionName)
    );
    const getMethodsForFunction = _.pipe(
      _.pickBy(isApiGMethod),
      _.pickBy(isMethodForFunction)
    );
    return getMethodsForFunction(this.compiledTemplate.Resources);
  }

  getEventSourceMappingsFor(functionName) {
    const isEventSourceMapping = _.matchesProperty('Type', 'AWS::Lambda::EventSourceMapping');
    const isMappingForFunction = _.pipe(
      _.prop('Properties.FunctionName'),
      flattenObject,
      _.includes(functionName)
    );
    const getMappingsForFunction = _.pipe(
      _.pickBy(isEventSourceMapping),
      _.pickBy(isMappingForFunction)
    );
    return getMappingsForFunction(this.compiledTemplate.Resources);
  }

  getSnsTopicsFor(functionName) {
    const isEventSourceMapping = _.matchesProperty('Type', 'AWS::SNS::Topic');
    const isMappingForFunction = _.pipe(
      _.prop('Properties.Subscription'),
      _.map(_.prop('Endpoint.Fn::GetAtt')),
      _.flatten,
      _.includes(functionName)
    );
    const getMappingsForFunction = _.pipe(
      _.pickBy(isEventSourceMapping),
      _.pickBy(isMappingForFunction)
    );
    return getMappingsForFunction(this.compiledTemplate.Resources);
  }

  getS3EventsFor(functionName) {
    const isEventSourceMapping = _.matchesProperty('Type', 'AWS::S3::Bucket');
    const isMappingForFunction = _.pipe(
      _.prop('Properties.NotificationConfiguration.LambdaConfigurations'),
      _.map(_.prop('Function.Fn::GetAtt')),
      _.flatten,
      _.includes(functionName)
    );
    const getMappingsForFunction = _.pipe(
      _.pickBy(isEventSourceMapping),
      _.pickBy(isMappingForFunction)
    );
    return getMappingsForFunction(this.compiledTemplate.Resources);
  }

  getVersionNameFor(functionName) {
    const isLambdaVersion = _.matchesProperty('Type', 'AWS::Lambda::Version');
    const isVersionForFunction = _.matchesProperty('Properties.FunctionName.Ref', functionName);
    const getVersionNameForFunction = _.pipe(
      _.pickBy(isLambdaVersion),
      _.findKey(isVersionForFunction)
    );
    return getVersionNameForFunction(this.compiledTemplate.Resources);
  }

  getLambdaPermissionsFor(functionName) {
    const isLambdaPermission = _.matchesProperty('Type', 'AWS::Lambda::Permission');
    const isPermissionForFunction = _.matchesProperty('Properties.FunctionName.Fn::GetAtt[0]', functionName);
    const getPermissionForFunction = _.pipe(
      _.pickBy(isLambdaPermission),
      _.pickBy(isPermissionForFunction)
    );
    return getPermissionForFunction(this.compiledTemplate.Resources);
  }

  getDeploymentSettingsFor(serverlessFunction) {
    const fnDeploymentSetting = this.service.getFunction(serverlessFunction).deploymentSettings;
    return Object.assign({}, this.globalSettings, fnDeploymentSetting);
  }

  getResourceLogicalName(resource) {
    return _.head(_.keys(resource));
  }
}

module.exports = ServerlessGradualTrafficShifting;
