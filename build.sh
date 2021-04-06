#!/usr/bin/env bash

ACCOUNT_ID="${AWSAcctId:=298068947512}" #<YOUR_ACCT_ID>
REGION="${Region:=eu-central-1}"

C_NAME=django_ecs_app
TAG=0.0.1

NGINX_NAME=ecs_nginx
NGINX_TAG=0.0.1

# ECR login
$(aws ecr get-login --no-include-email)


# Change to the app directory
pushd ./exact


####################
# Build Django App #
####################

# Check if the repo exists, if not create it
aws ecr describe-repositories --repository-names $C_NAME || aws ecr create-repository --repository-name $C_NAME

# Build the container using the specified Docker file but pass 
# in all of the context and files from the current location --no-cache
docker build  \
-t $C_NAME:$TAG \
-f ./deployment/django/Dockerfile .

# Tag the image 
docker tag $C_NAME:$TAG \
$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$C_NAME:$TAG

# Push to ECR 
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$C_NAME:$TAG

# Remove old image version for the same tag - keeps cost down if you don't want AWS to charge storage for old versions 
IMAGES_TO_DELETE=$( \
    aws ecr list-images \
    --region $REGION \
    --repository-name $C_NAME \
    --filter "tagStatus=UNTAGGED" \
    --query 'imageIds[*]' \
    --output json \
) || echo "no images to remove"
aws ecr batch-delete-image --region $REGION --repository-name $C_NAME --image-ids "$IMAGES_TO_DELETE" || true


###############
# Build Nginx #
###############
aws ecr describe-repositories --repository-names $NGINX_NAME || aws ecr create-repository --repository-name $NGINX_NAME

docker build --no-cache \
-t $NGINX_NAME:$NGINX_TAG \
-f ./deployment/nginx/Dockerfile .

# # Tag the image 
docker tag $NGINX_NAME:$NGINX_TAG \
$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$NGINX_NAME:$NGINX_TAG

# # Push to ECR 
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$NGINX_NAME:$NGINX_TAG

# # Remove old image version for the same tag - keeps cost down if you don't want AWS to charge storage for old versions 
IMAGES_TO_DELETE=$( \
    aws ecr list-images \
    --region $REGION \
    --repository-name $NGINX_NAME \
    --filter "tagStatus=UNTAGGED" \
    --query 'imageIds[*]' \
    --output json \
) || echo "no images to remove"
aws ecr batch-delete-image --region $REGION --repository-name $NGINX_NAME --image-ids "$IMAGES_TO_DELETE" || true


popd
