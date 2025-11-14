FROM public.ecr.aws/lambda/nodejs:latest
WORKDIR ${LAMBDA_TASK_ROOT}

COPY index.js .
COPY package.json .
RUN npm install --only=production

CMD ["index.handler"]
