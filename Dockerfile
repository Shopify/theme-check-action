FROM ruby:3
RUN apt-get update \
    && apt-get install sudo \
    && gem install shopify-cli -N
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
