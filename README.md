# gcp-gke-devops
# Full GKE + GCP Deployment(Flask + React + PostgreSQL)

## Overview

This document describes the complete process of deploying a fullstack application to Google Kubernetes Engine (GKE).


<img width="524" alt="Screenshot_20260513_131330" src="https://github.com/user-attachments/assets/667cddd2-034d-42bb-a5ca-46f4058e63d0" />

Stack:

- React frontend
- Flask backend
- PostgreSQL database
- Google Kubernetes Engine (GKE)
- Google Artifact Registry
- Google Secret Manager
- Secrets Store CSI Driver
- GKE Ingress / Load Balancer

---

# 1. Create Google Cloud Project

Create a new project in Google Cloud:

```bash
gcloud projects create moja-zupa-gcp
```

Set active project:

```bash
gcloud config set project moja-zupa-gcp
```

Verify:

```bash
gcloud config get-value project
```

---

# 2. Enable Required APIs

Enable all required services:

```bash
gcloud services enable \
container.googleapis.com \
artifactregistry.googleapis.com \
secretmanager.googleapis.com
```

---

# 3. Create Artifact Registry Repository

Create Docker repository:

```bash
gcloud artifacts repositories create moja-zupa-repo \
--repository-format=docker \
--location=europe-central2 \
--description="Docker repository for moja-zupa app"
```

Verify:

```bash
gcloud artifacts repositories list --location=europe-central2
```

---

# 4. Configure Docker Authentication

Allow Docker to push images to Artifact Registry:

```bash
gcloud auth configure-docker europe-central2-docker.pkg.dev
```

---

# 5. Build Docker Images

## Backend

```bash
docker build -t europe-central2-docker.pkg.dev/moja-zupa-gcp/moja-zupa-repo/backend:v1 .
```

## Frontend

```bash
docker build -t europe-central2-docker.pkg.dev/moja-zupa-gcp/moja-zupa-repo/frontend:v1 .
```

---

# 6. Push Docker Images

## Backend

```bash
docker push europe-central2-docker.pkg.dev/moja-zupa-gcp/moja-zupa-repo/backend:v1
```

## Frontend

```bash
docker push europe-central2-docker.pkg.dev/moja-zupa-gcp/moja-zupa-repo/frontend:v1
```

Verify uploaded images:

```bash
gcloud artifacts docker images list \
europe-central2-docker.pkg.dev/moja-zupa-gcp/moja-zupa-repo
```

---

# 7. Create GKE Cluster

Create cluster:

```bash
gcloud container clusters create moja-zupa-gke \
--zone europe-central2-a \
--num-nodes 2
```

Connect kubectl to cluster:

```bash
gcloud container clusters get-credentials moja-zupa-gke \
--zone europe-central2-a
```

Verify:

```bash
kubectl get nodes
```

---

# 8. Grant Artifact Registry Access

By default, GKE nodes use the `default` service account.

Verify:

```bash
gcloud container clusters describe moja-zupa-gke \
--zone europe-central2-a \
--format="value(nodeConfig.serviceAccount)"
```

Result:

```text
default
```

Get project number:

```bash
PROJECT_NUMBER=$(gcloud projects describe moja-zupa-gcp --format="value(projectNumber)")
```

Grant Artifact Registry read access:

```bash
gcloud projects add-iam-policy-binding moja-zupa-gcp \
--member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
--role="roles/artifactregistry.reader"
```

---

# 9. Create Secrets in Secret Manager

## DB-HOST

```bash
echo -n "db" | gcloud secrets create DB-HOST --data-file=-
```

## DB-USER

```bash
echo -n "postgres" | gcloud secrets create DB-USER --data-file=-
```

## DB-PASSWORD

```bash
echo -n "password" | gcloud secrets create DB-PASSWORD --data-file=-
```

## DB-NAME

```bash
echo -n "postgres" | gcloud secrets create DB-NAME --data-file=-
```

---

# 10. Install Secrets Store CSI Driver Sync RBAC

GKE addon mounted secrets correctly but DID NOT synchronize them into Kubernetes Secrets.

This command fixed it:

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/secrets-store-csi-driver/main/deploy/rbac-secretprovidersyncing.yaml
```

Without this step:

- files appeared in `/mnt/secrets-store`
- but `zupa-db-secrets` Kubernetes Secret was NOT created
- environment variables were empty

---

# 11. Create Kubernetes Service Account

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: zupa-ksa
```

Apply:

```bash
kubectl apply -f service-account.yaml
```

---

# 12. Create Main Kubernetes YAML

Main resources:

- PostgreSQL PVC
- PostgreSQL Deployment
- PostgreSQL Service
- SecretProviderClass
- Backend Deployment
- Backend Service
- Frontend Deployment
- Frontend Service
- Ingress

Important configuration:

## Persistent Volume

```yaml
storageClassName: standard-rwo
```

This solved GKE Persistent Volume provisioning.

---

## SecretProviderClass

Important:

`path:` controls mounted filenames AND Kubernetes Secret keys.

Using dashes:

```yaml
path: "DB-HOST"
```

creates:

```text
DB-HOST
```

But Linux environment variables cannot contain `-`.

Therefore:

```yaml
path: "DB_HOST"
```

must be used.

Final version:

```yaml
secretObjects:
- secretName: zupa-db-secrets
  type: Opaque
  data:
  - objectName: DB_HOST
    key: DB_HOST
```

---

## Backend Environment Variables

```yaml
envFrom:
- secretRef:
    name: zupa-db-secrets
```

This automatically loads all secret keys as environment variables.

---

# 13. Apply Deployment

```bash
kubectl apply -f app.yaml
```

---

# 14. Verify Pods

```bash
kubectl get pods
```

Expected:

```text
postgres-db      Running
flask-backend    Running
react-frontend   Running
```

---

# 15. Common Issues We Solved

## ImagePullBackOff

Problem:

```text
image not found
```

Cause:

Images were pushed as `:v1` but deployment used `:latest`.

Fix:

```yaml
image: backend:v1
```

---

## Secret Not Found

Problem:

```text
secret "zupa-db-secrets" not found
```

Cause:

CSI Driver mounted files but did not synchronize Kubernetes Secret.

Fix:

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/secrets-store-csi-driver/main/deploy/rbac-secretprovidersyncing.yaml
```

---

## Environment Variables Missing

Problem:

`env` inside container did not show DB variables.

Cause:

Keys used `-` instead of `_`.

Linux environment variables:

```text
DB_HOST
```

work.

```text
DB-HOST
```

does NOT work.

---

## Ingress Stuck

Problem:

Ingress had no external IP.

Fix:

Delete and recreate ingress:

```bash
kubectl delete ingress main-ingress
kubectl apply -f app.yaml
```

Eventually GCP created:

- forwarding rules
- backend services
- load balancer
- public IP

---

# 16. Health Checks

Backend initially returned:

```text
404 /
```

GKE Load Balancer health checks failed.

Added:

```yaml
livenessProbe:
  httpGet:
    path: /api/status
    port: 5000
  initialDelaySeconds: 15
  periodSeconds: 20

readinessProbe:
  httpGet:
    path: /api/status
    port: 5000
  initialDelaySeconds: 5
  periodSeconds: 10
```

Health endpoint:

```python
@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({"status": "ok", "message": "Backend works!"})
```

---

# 17. Understanding Liveness vs Readiness

## readinessProbe

Controls whether traffic is routed to pod.

If readiness fails:

- pod stays alive
- but Load Balancer stops sending requests

---

## livenessProbe

Checks whether application is healthy.

If liveness fails repeatedly:

- Kubernetes restarts container

---

## failureThreshold: 3

Means:

```text
3 consecutive failures required
```

before action is taken.

---

# 18. Final Verification

Check public IP:

```bash
kubectl get ingress
```

Open:

```text
http://EXTERNAL_IP/
```

Frontend should load.

Check backend:

```text
http://EXTERNAL_IP/api/status
```

Expected:

```json
{
  "status": "ok",
  "message": "Backend works!"
}
```

---

# 19. Useful Debugging Commands

## Pods

```bash
kubectl get pods
```

---

## Logs

```bash
kubectl logs POD_NAME
```

---

## Describe Pod

```bash
kubectl describe pod POD_NAME
```

---

## Check Mounted Secrets

```bash
kubectl exec -it POD_NAME -- sh
```

Then:

```bash
cd /mnt/secrets-store
ls
```

---

## Check Environment Variables

```bash
kubectl exec -it POD_NAME -- env | grep DB_
```

---

## Restart Deployment

```bash
kubectl rollout restart deployment flask-backend
```

---

## Delete Entire Deployment

```bash
kubectl delete -f app.yaml
```

---

# 20. Cost Optimization

GKE cannot truly be paused.

Cheapest options:

## Scale node pool to zero

```bash
gcloud container clusters resize moja-zupa-gke \
--node-pool default-pool \
--num-nodes 0 \
--zone europe-central2-a
```

Cluster still exists.

---

## Delete entire cluster

```bash
gcloud container clusters delete moja-zupa-gke \
--zone europe-central2-a
```

Most cost-efficient.

---

## GitHub Actions + GCP (OIDC / Workload Identity Federation)

```bash
PROJECT_ID=moja-zupa-gcp
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
POOL_ID=github-pool
PROVIDER_ID=github-provider
SA_NAME=github-actions
SA_EMAIL=$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com
REPO=blendermen/gcp-gke-devops
```

Create Service Account
```bash
cloud iam service-accounts create github-actions \
  --project=$PROJECT_ID \
  --display-name="GitHub Actions CI"
```

Add new roles to the newly created Service Account
```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/container.developer"
```

Create Working Identity Federation
```bash
gcloud iam workload-identity-pools create $POOL_ID \
  --project=$PROJECT_ID \
  --location="global" \
  --display-name="GitHub pool"
```

Create Provider
```bash
gcloud iam workload-identity-pools providers create-oidc $PROVIDER_ID \
  --project=$PROJECT_ID \
  --location="global" \
  --workload-identity-pool=$POOL_ID \
  --display-name="GitHub provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='$REPO'"
```

Bind SA to GitHub
```bash
gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL \
  --project=$PROJECT_ID \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_ID/attribute.repository/$REPO"
```

Add binding
```bash
gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL \
  --role="roles/iam.serviceAccountTokenCreator" \
  --member="serviceAccount:$SA_EMAIL"
```

In Github repo settings add new secrets
```bash
GCP_PROJECT_ID = moja-zupa-gcp
GCP_WIF_PROVIDER = projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider
GCP_SERVICE_ACCOUNT = github-actions@moja-zupa-gcp.iam.gserviceaccount.com
```


# Final Result

Successfully deployed:

- React frontend
- Flask backend
- PostgreSQL
- Persistent storage
- Secrets from Google Secret Manager
- Environment variables via CSI Driver
- Public HTTPS-ready ingress
- Health checks
- Production-style Kubernetes architecture

