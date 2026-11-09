# DeepTutor server deployment

The server checkout is `/home/ubuntu/deeptutor/source`. Its `origin` points
to the personal GitHub fork and `custom` is the deployed branch.
`upstream` points to the original project.

After committing and pushing changes to `origin/custom`, deploy on the server:

```bash
bash /home/ubuntu/deeptutor/source/deployment/deploy.sh
```

The command fetches and fast-forwards `custom`, then re-executes the fetched
deployment script. It checks that the checkout is clean and that the running
application is healthy. If the application source matches the running image,
it reports that no rebuild is necessary. Otherwise, it builds a revision-labelled
frontend from the committed Git tree, validates the deployment configuration,
backs up the stopped data volume and configuration, and switches the container.
It checks SQLite integrity and row counts after startup and restores the prior
Compose configuration if the switch fails.

The current base image contains the customized v1.7.2 backend. The frontend
build reapplies the registration and GeoGebra patches. Changes to backend code,
dependencies, runtime scripts, or the Dockerfile since v1.7.2 are rejected.
For an upstream release or backend update, first adapt and verify
`Dockerfile.base`, the frontend patches, and the model-picker bind mount;
then update the base revision and image guard in `deploy.sh`.

The reference `compose.example.yaml` documents the service, ports and mounts;
it is not applied automatically. Server-specific `compose.yaml`, `.env`, the generated model-picker file,
credentials, data, and backups remain in `/home/ubuntu/deeptutor` and are not
part of this repository. The deployment keeps their existing values. Backup
directories are created under `/home/ubuntu/deeptutor/backups`.
