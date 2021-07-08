FROM ruby:3
RUN gem install theme-check -N
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
