# Cloud Build Permission Fix

**Error**: Service account forbidden from accessing Cloud Build bucket
**Date**: 2026-01-27
**Workflow**: Deploy Backend to Cloud Run

---

## ❌ Error Details

```
ERROR: (gcloud.builds.submit) The user is forbidden from accessing the bucket
[renovation-planner-agent_cloudbuild]. Please check your organization's policy
or if the user has the "serviceusage.services.use" permission.
```

**Service Account**: `songyinggoh@renovation-planner-agent.iam.gserviceaccount.com`

---

## 🔍 Root Cause

The service account used by Workload Identity Federation lacks permissions to:
1. Access the Cloud Build staging bucket (`renovation-planner-agent_cloudbuild`)
2. Use the Service Usage API
3. Submit Cloud Build jobs

---

## ✅ Solution Options

### Option 1: Add Required IAM Roles (Recommended)

Add these roles to your service account in Google Cloud Console:

```bash
# Set variables
PROJECT_ID="renovation-planner-agent"
SERVICE_ACCOUNT="songyinggoh@renovation-planner-agent.iam.gserviceaccount.com"

# Add Cloud Build Editor role
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/cloudbuild.builds.editor"

# Add Service Usage Consumer role
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/serviceusage.serviceUsageConsumer"

# Add Storage Admin role (for Cloud Build bucket access)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/storage.admin"

# Verify roles
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$SERVICE_ACCOUNT" \
  --format="table(bindings.role)"
```

**Expected Roles After Fix**:
- ✅ `roles/cloudbuild.builds.editor` - Submit Cloud Build jobs
- ✅ `roles/serviceusage.serviceUsageConsumer` - Use Service Usage API
- ✅ `roles/storage.admin` - Access Cloud Build bucket
- ✅ `roles/run.admin` - Deploy to Cloud Run (already exists)
- ✅ `roles/iam.serviceAccountUser` - Act as service account (already exists)

---

### Option 2: Use Docker Build Instead (Alternative)

Modify workflow to build Docker image directly without Cloud Build:

**File**: `.github/workflows/backend-deploy.yml`

```yaml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

- name: Build and Push Docker Image
  run: |
    cd backend
    # Authenticate Docker with GCR
    gcloud auth configure-docker gcr.io

    # Build and push using Docker directly
    docker build -t gcr.io/$PROJECT_ID/$SERVICE_NAME:latest .
    docker push gcr.io/$PROJECT_ID/$SERVICE_NAME:latest
```

**Pros**: No Cloud Build bucket access needed
**Cons**: Slower builds (no caching), larger GitHub Actions runner usage

---

### Option 3: Use Artifact Registry (Modern Approach)

Switch from GCR to Artifact Registry (Google's recommended solution):

**Step 1: Create Artifact Registry Repository**
```bash
# Create repository
gcloud artifacts repositories create docker-repo \
  --repository-format=docker \
  --location=us-central1 \
  --description="Docker images for renovation backend" \
  --project=renovation-planner-agent

# Grant service account access
gcloud artifacts repositories add-iam-policy-binding docker-repo \
  --location=us-central1 \
  --member="serviceAccount:songyinggoh@renovation-planner-agent.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer" \
  --project=renovation-planner-agent
```

**Step 2: Update Workflow**

Change image path from:
```yaml
gcr.io/renovation-planner-agent/renovation-backend
```

To:
```yaml
us-central1-docker.pkg.dev/renovation-planner-agent/docker-repo/renovation-backend
```

**Updated workflow snippet**:
```yaml
- name: Build and Push Docker Image
  run: |
    cd backend
    gcloud builds submit --tag us-central1-docker.pkg.dev/$PROJECT_ID/docker-repo/$SERVICE_NAME

- name: Deploy to Cloud Run
  run: |
    gcloud run deploy $SERVICE_NAME \
      --image us-central1-docker.pkg.dev/$PROJECT_ID/docker-repo/$SERVICE_NAME \
      --region $REGION \
      --platform managed \
      --allow-unauthenticated
```

**Pros**: Modern, better performance, integrated with IAM
**Cons**: Requires repository creation

---

## 🎯 Recommended Solution: Option 1 + Enable APIs

**Step-by-Step Fix**:

### 1. Enable Required APIs
```bash
gcloud services enable cloudbuild.googleapis.com \
  --project=renovation-planner-agent

gcloud services enable serviceusage.googleapis.com \
  --project=renovation-planner-agent

gcloud services enable storage.googleapis.com \
  --project=renovation-planner-agent
```

### 2. Add IAM Roles (Run all three)
```bash
PROJECT_ID="renovation-planner-agent"
SA="songyinggoh@renovation-planner-agent.iam.gserviceaccount.com"

# Cloud Build Editor
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/cloudbuild.builds.editor"

# Service Usage Consumer
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/serviceusage.serviceUsageConsumer"

# Storage Admin
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/storage.admin"
```

### 3. Verify Configuration
```bash
# Check service account roles
gcloud projects get-iam-policy renovation-planner-agent \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:songyinggoh@renovation-planner-agent.iam.gserviceaccount.com" \
  --format="table(bindings.role)"

# Expected output should include:
# roles/cloudbuild.builds.editor
# roles/serviceusage.serviceUsageConsumer
# roles/storage.admin
# roles/run.admin
# roles/iam.serviceAccountUser
```

### 4. Test Deployment
```bash
# Make a small change and push
cd backend
echo "# Build test - $(date)" >> .deployment-test
git add .deployment-test
git commit -m "test: verify Cloud Build permissions fix"
git push origin main
```

---

## 🔐 Security Considerations

### Current Permissions (After Fix)
- `roles/storage.admin` - **Broad access**

### More Secure Alternative (Least Privilege)
Instead of `roles/storage.admin`, use specific bucket permissions:

```bash
# Get the Cloud Build bucket name
BUCKET_NAME="${PROJECT_ID}_cloudbuild"

# Grant specific bucket access
gsutil iam ch \
  serviceAccount:songyinggoh@renovation-planner-agent.iam.gserviceaccount.com:objectAdmin \
  gs://${BUCKET_NAME}

# Or use custom role with minimal permissions
gcloud iam roles create cloudBuildMinimal \
  --project=renovation-planner-agent \
  --title="Cloud Build Minimal" \
  --description="Minimal permissions for Cloud Build" \
  --permissions=storage.buckets.get,storage.objects.create,storage.objects.delete,storage.objects.get

gcloud projects add-iam-policy-binding renovation-planner-agent \
  --member="serviceAccount:songyinggoh@renovation-planner-agent.iam.gserviceaccount.com" \
  --role="projects/renovation-planner-agent/roles/cloudBuildMinimal"
```

---

## 📋 Verification Checklist

After applying fixes, verify:

- [ ] All required APIs enabled
  ```bash
  gcloud services list --enabled --project=renovation-planner-agent | grep -E "(cloudbuild|serviceusage|storage)"
  ```

- [ ] Service account has required roles
  ```bash
  gcloud projects get-iam-policy renovation-planner-agent \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:songyinggoh@renovation-planner-agent.iam.gserviceaccount.com"
  ```

- [ ] Cloud Build bucket exists
  ```bash
  gsutil ls -p renovation-planner-agent | grep cloudbuild
  ```

- [ ] Workflow runs successfully
  - Push to main branch
  - Check GitHub Actions
  - Verify all steps pass

---

## 🚀 Alternative: Quick Fix for Testing

If you need a quick temporary fix to test deployment, modify the workflow to use Docker directly:

**Create**: `.github/workflows/backend-deploy-docker.yml`

```yaml
name: Deploy Backend (Docker Build)

on:
  push:
    branches:
      - main
    paths:
      - 'backend/**'

env:
  PROJECT_ID: renovation-planner-agent
  SERVICE_NAME: renovation-backend
  REGION: us-central1
  IMAGE_NAME: gcr.io/renovation-planner-agent/renovation-backend

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Google Auth
        uses: 'google-github-actions/auth@v2'
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: 'songyinggoh@renovation-planner-agent.iam.gserviceaccount.com'

      - name: Set up Cloud SDK
        uses: 'google-github-actions/setup-gcloud@v2'

      - name: Configure Docker for GCR
        run: gcloud auth configure-docker gcr.io

      - name: Build Docker Image
        run: |
          cd backend
          docker build -t $IMAGE_NAME:latest -t $IMAGE_NAME:${{ github.sha }} .

      - name: Push Docker Image
        run: |
          docker push $IMAGE_NAME:latest
          docker push $IMAGE_NAME:${{ github.sha }}

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy $SERVICE_NAME \
            --image $IMAGE_NAME:latest \
            --region $REGION \
            --platform managed \
            --allow-unauthenticated \
            --project $PROJECT_ID
```

**Note**: This bypasses Cloud Build but requires more runner time.

---

## 📚 References

- [Cloud Build IAM Roles](https://cloud.google.com/build/docs/iam-roles-permissions)
- [Service Usage API](https://cloud.google.com/service-usage/docs/reference/rest)
- [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)
- [Artifact Registry Migration](https://cloud.google.com/artifact-registry/docs/transition/transition-from-gcr)
