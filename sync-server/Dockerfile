FROM node:22-alpine
WORKDIR /app
COPY server.mjs ./
ENV PORT=8787 NOTES_DIR=/data/notes
RUN mkdir -p /data/notes
EXPOSE 8787
CMD ["node", "server.mjs"]
