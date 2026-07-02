# Delivery Security Scan Checklist

This checklist is for delivery rehearsals before connecting to the real control board.

## Baseline

- Confirm `.env` is not committed.
- Set a long random `JWT_SECRET`.
- Keep `CONTROL_BOARD_DRY_RUN=true` until field TCP host/port are confirmed.
- Confirm Nginx is the browser entrypoint: `http://<PUBLIC_HOST>:<NGINX_PORT>`.

## Required Commands

```bash
npm audit --workspaces
npm run ci
docker compose config --quiet
```

## Recommended Commands

```bash
gitleaks detect --source . --redact
trivy fs --scanners vuln,secret,misconfig .
trivy image lidar_dashboard_autodev-backend
trivy image lidar_dashboard_autodev-frontend
zap-baseline.py -t http://localhost:8080 -r zap-baseline.html
```

## Notes

- Do not run active DAST or fuzzing against the real integrated control board.
- Swagger may remain enabled during internal test; restrict or remove external access before delivery if the network is not fully trusted.
- Record all skipped checks with the reason, tool version, date, and operator.
