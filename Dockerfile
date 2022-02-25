FROM cpclermont/theme-check-action:1.0.0

COPY entrypoint.sh /entrypoint.sh
COPY index.js /index.js

ENTRYPOINT ["/entrypoint.sh"]
