#!/usr/bin/env bash

INPUT_CFSTACKNAME="static-example-richardwillis-cloudformation-stack" \
    INPUT_S3BUCKETNAME="static-example-richardwillis-info-us-east-1" \
    INPUT_S3ALLOWEDORIGINS="https://static-example.richardwillis.info" \
    INPUT_ROOTCLOUDFRONTHOSTS="static-example.richardwillis.info" \
    INPUT_PREVIEWCLOUDFRONTHOSTS="*.preview.static-example.richardwillis.info" \
    INPUT_CACHECORSPATHPATTERN="/_next/*" \
    INPUT_CERTIFICATEARN="arn:aws:acm:us-east-1:008215002370:certificate/39df7626-7d2f-42e9-94f4-a3ce61ca3d5e" \
    INPUT_OUTDIR="./out" \
    node lib/main.js

# INPUT_S3BUCKETNAME="assets.richardwillisinfo-us-east-1"
