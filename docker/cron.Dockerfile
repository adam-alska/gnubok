FROM alpine:3.19

ARG SUPERCRONIC_VERSION=v0.2.33
ARG TARGETARCH

RUN apk add --no-cache curl \
    && ARCH=$(case ${TARGETARCH} in amd64) echo "linux-amd64";; arm64) echo "linux-arm64";; *) echo "linux-amd64";; esac) \
    && curl -fsSL "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-${ARCH}" \
       -o /usr/local/bin/supercronic \
    && chmod +x /usr/local/bin/supercronic

ENTRYPOINT ["supercronic"]
CMD ["/etc/supercronic/crontab"]
