# Serverless Gradual Traffic Shifting Example


* A Lambda function with an HTTP event where we'll test the gradual traffic shifting

## Usage

First, we need to set up the service and deploy it in our AWS account without the versionWeight and liveVersion information.
So 100% traffic will be routed to new deployed version

```console
$ npm i
$ sls deploy -s dev
```
When you call your newly created endpoint, you should see the following message:

```console
$ curl https://example.endpoint.com/dev/hello
{"message":"1"}
```

To check how traffic is shifted gradually, modify `handler.js`.
Modify `serverless.yml` as:
```yaml
    liveVersion: 1
    versionWeight: 0.20
```
under deploymentSettings

Here the function's deployment is configured so that it shifts a 20% of the traffic to the new version immediately

Now deploy your service again. You'll see that the output varies accross endpoint calls.

```console
$ sls deploy --stage dev

$ curl https://example.endpoint.com/dev/hello
{"message":"1"}

$ curl https://example.endpoint.com/dev/hello
{"message":"2"}
```
Response is version 1 80% of the times and version 2 20% of the times.