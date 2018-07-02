module.exports.hello = (event, context, callback) => {
  console.log("Handler function name " + context.functionName  +  ":"  +  context.functionVersion);
    
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: context.functionVersion
    })
  };
  return callback(null, response);
};
