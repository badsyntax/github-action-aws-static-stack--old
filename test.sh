#!/usr/bin/env bash

INPUT_CFSTACKNAME="static-example-richardwillis-cloudformation-stack" \
    INPUT_S3BUCKETNAME="static-example-richardwillis-info-us-east-1" \
    INPUT_S3ALLOWEDORIGINS="https://static-example.richardwillis.info" \
    INPUT_ROOTCLOUDFRONTHOSTS="static-example.richardwillis.info" \
    INPUT_PREVIEWCLOUDFRONTHOSTS="*.preview.static-example.richardwillis.info" \
    INPUT_CACHECORSPATHPATTERN="/_next/*" \
    INPUT_CERTIFICATEARN="arn:aws:acm:us-east-1:1234567:certificate/123abc-123abc-1234-5678-abcdef" \
    node lib/main.js
