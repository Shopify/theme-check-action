FROM cpclermont/theme-check-action:1.0.2

COPY entrypoint.sh /entrypoint.sh
COPY index.js /index.js

ENTRYPOINT ["/entrypoint.sh"]
