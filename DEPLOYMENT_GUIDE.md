# Deploy LOOPLI CRM to Render

The repository includes a Render Blueprint in `render.yaml` for the Next.js web app, NestJS API, and PostgreSQL database.

## Before deploying

- Push the source to `main` in GitHub and connect that repository to Render.
- Review the free-plan limits below. Render's free Postgres database expires after 30 days, and free web services can sleep when idle. Upgrade the database before storing real client data.
- Configure unique `ADMIN_PASSWORD`, `STAFF_PASSWORD`, and `CLIENT_PASSWORD` values for the private initial workspace, plus separate `DEMO_ADMIN_PASSWORD`, `DEMO_MANAGER_PASSWORD`, `DEMO_HR_PASSWORD`, `DEMO_EMPLOYEE_PASSWORD`, and `DEMO_CLIENT_PASSWORD` values for the public sandbox. Render also requests matching `NEXT_PUBLIC_DEMO_*_PASSWORD` values for the web service; use the same value for each API/web pair.
- Render generates `JWT_SECRET` automatically. Do not replace it with a committed value.

## Deploy the Blueprint

1. In Render, choose **New → Blueprint** and select `AnupChauhan1/loopliy`.
2. Select the `main` branch and approve the services listed in `render.yaml`.
3. Enter private initial-workspace passwords and separate sandbox passwords when prompted. The public sandbox passwords are intentionally displayed on the login page; they must belong only to the isolated demo organization.
4. Wait for the database, API, and web service deployments to finish. The API applies migrations before startup and seeds the initial organization and accounts once after its first successful deployment.
5. If Render assigns a different service hostname, update `NEXT_PUBLIC_API_URL` on the web service and `CORS_ORIGINS` on the API service to match. `CORS_ORIGINS` accepts a comma-separated list of frontend hostnames or origins.

## Initial accounts

The first successful API deployment seeds the private initial workspace accounts (`admin@epatang.com`, `pm@epatang.com`, `hr@epatang.com`, `employee@epatang.com`, and `client@acme.com`) using the private password variables. It also seeds the separate `LOOPLI Public Demo` organization with `admin@loopli.com`, `manager@loopli.com`, `hr@loopli.com`, `employee@loopli.com`, and `client@loopli.com`. The login page displays these role-specific sandbox credentials; they can access synthetic demo data only, not the private initial workspace. Keep each web `NEXT_PUBLIC_DEMO_*_PASSWORD` value synchronized with the corresponding API `DEMO_*_PASSWORD` value.

The seed command updates demo passwords when rerun, so do not rerun it after users have changed passwords in either workspace.

## Production considerations

- **Free database expiration:** Render free Postgres is limited to 1 GB and expires after 30 days. Upgrade it and configure backups before production use.
- **Free web services:** They sleep after inactivity and can take about a minute to wake. Use an appropriate paid plan for a client-facing production deployment.
- **Uploads:** API uploads are stored on the service filesystem, which is ephemeral on Render. Uploaded files can be lost on redeploy or restart; configure durable object storage before relying on uploads.
- **Background worker:** Worker source is included, but the current worker has no implemented job handlers and is not included in the default Blueprint. Render background workers require a paid compute plan.
- **Secrets:** Keep `.env` local. Set production credentials through Render's environment-variable dashboard only.

## Local production checks

```sh
npm ci
npm ci --prefix apps/api
npm run prisma:generate
npm run build:api
```

For the web app, run `npm ci` and `npm run build` from `apps/web`.
