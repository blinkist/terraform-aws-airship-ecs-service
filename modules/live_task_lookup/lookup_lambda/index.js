const AWS = require('aws-sdk');
const ecs = new AWS.ECS();

var returnMap = {
  'image': '',
  'memory_reservation': '',
  'cpu': '',
  'memory': '',
  'environment': [],
  'task_revision': ''
};


exports.handler = async (event) => {
  function AirshipLambdaError(message) {
    this.name = "AirshipLambdaError";
    this.message = message;
  }
  AirshipLambdaError.prototype = new Error();

  //
  // ECS Cluster and Service Lookup
  //

  // This throws an error in case the Cluster has not been found
  const res = await ecs.describeServices({
    cluster: event.ecs_cluster,
    services: [event.ecs_service]
  }).promise();


  // Throw an error when the lookup returns more than one service
  // Return empty definitions in case no services have been found
  if (res.services.length > 1) {
    const error = new AirshipLambdaError("multiple services with name %s found in cluster %s Not Found" % event.ecs_service, event.ecs_cluster);
    throw error;
  } else if (res.services.length < 1) {
    return {
      statusCode: 200,
      body: returnMap
    };
  }

  //
  // ECS Task definition and container definition lookup
  //

  const taskDefinition = res.services[0].taskDefinition;

  const resTask = await ecs.describeTaskDefinition({
    taskDefinition: taskDefinition
  }).promise();

  if (resTask.taskDefinition.containerDefinitions.length != 1) {
    const error = new AirshipLambdaError("only a single container is supported per task definition");
    throw error;
  }

  // Match the container with the given container name
  var containerDefinitions = resTask.taskDefinition.containerDefinitions.filter(function(containerDef) {
    return containerDef.name == event.ecs_task_container_name;
  });

  if ( containerDefinitions.length != 1 ){
    const error = new AirshipLambdaError("Could not find container definition: %s" % event.ecs_task_container_name );
    throw error;
  }

  // Populating the map for return
  returnMap['task_revision'] = String(resTask.taskDefinition.revision);
  returnMap['image'] = String(containerDefinitions[0].image);
  returnMap['memory_reservation'] = String(containerDefinitions[0].memoryReservation);
  returnMap['cpu'] = String(containerDefinitions[0].cpu);
  returnMap['memory'] =  String(containerDefinitions[0].memory);

  var envDict = {};
  containerDefinitions[0].environment.forEach(function(element) {
    // HCL parses "true" as 1, we need to copy this behaviour
    envDict[String(element.name)] = ( String(element.value) == "true" ? "1" : String(element.value) ) ;
  });

  returnMap['environment'] = JSON.stringify(envDict,Object.keys(envDict).sort());
  console.log(returnMap['environment'])
  return returnMap;
};