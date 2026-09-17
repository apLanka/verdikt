#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { VerdiktStack } from "../lib/verdikt-stack.js";

const app = new cdk.App();
new VerdiktStack(app, "VerdiktStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
