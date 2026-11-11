FROM postgres:18-bookworm

ARG TARGETARCH

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends age ca-certificates curl unzip; \
    case "${TARGETARCH:-amd64}" in \
      amd64) AWS_ARCH="x86_64" ;; \
      arm64) AWS_ARCH="aarch64" ;; \
      *) echo "Unsupported build architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl --fail --silent --show-error --location \
      "https://awscli.amazonaws.com/awscli-exe-linux-${AWS_ARCH}.zip" \
      --output /tmp/awscliv2.zip; \
    unzip -q /tmp/awscliv2.zip -d /tmp; \
    /tmp/aws/install; \
    rm -rf /tmp/aws /tmp/awscliv2.zip; \
    apt-get purge -y --auto-remove curl unzip; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backup.sh /app/backup.sh
RUN chmod 0755 /app/backup.sh

CMD ["/bin/bash", "/app/backup.sh"]
