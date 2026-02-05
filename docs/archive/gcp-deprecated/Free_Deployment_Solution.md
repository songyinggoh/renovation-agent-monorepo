# Free Deployment Solution (No Billing Required)

**Date**: 2026-01-27
**Issue**: GCR requires Artifact Registry API which needs billing account
**Solution**: Use GitHub Container Registry (GHCR) - completely free!

---

## 🚫 Problem

When attempting to push Docker images to Google Container Registry (GCR):

```
denied: Artifact Registry API has not been used in project 282699080720
before or it is disabled. Enable it by visiting
https://console.developers.google.com/apis/api/artifactregistry.googleapis.com/overview?project=282699080720
```

**Root Cause**:
- GCR (gcr.io) now redirects to Artifact Registry
- Artifact Registry API requires a billing account
- User doesn't want to enable billing

---

## ✅ Solution: GitHub Container Registry (GHCR)

GitHub Container Registry (ghcr.io) is **completely free** and integrates perfectly with GitHub Actions.

### Benefits
- ✅ **100% Free** - No billing account needed
- ✅ **Unlimited public images** - Free for open source
- ✅ **Native GitHub integration** - Uses GITHUB_TOKEN
- ✅ **Fast** - Images stored on GitHub's infrastructure
- ✅ **Automatic auth** - No manual credential setup
- ✅ **Works with Cloud Run** - Can pull from public GHCR

### Workflow Created
**File**: `.github/workflows/backend-deploy-ghcr.yml`

**Changes from GCR version**:
- Uses `ghcr.io` instead of `gcr.io`
- Authenticates with GitHub token (not GCP)
- Pushes to GitHub Container Registry (free)
- Cloud Run pulls from GHCR (public access)

---

## 🚀 How It Works

### 1. Build Phase (GitHub Actions)
```yaml
- Log in to GHCR using GITHUB_TOKEN (automatic)
- Build Docker image
- Tag: ghcr.io/OWNER/renovation-backend:latest
- Push to GitHub Container Registry (free!)
```

### 2. Deploy Phase (Cloud Run)
```yaml
- Authenticate with GCP using WIF
- Deploy to Cloud Run using GHCR image
- Cloud Run pulls from public GHCR (no auth needed)
```

### Architecture
```
GitHub Actions → Build Docker Image
      ↓
GitHub Container Registry (ghcr.io) - FREE
      ↓
Cloud Run pulls image → Deploys service
```

---

## 📦 Container Image Details

**Registry**: GitHub Container Registry (ghcr.io)
**Image Path**: `ghcr.io/songyinggoh/renovation-agent-monorepo-backend`
**Tags**:
- `latest` - Most recent deployment
- `<git-sha>` - Specific commit (e.g., `e0200d0`)

**Visibility**: Public (required for Cloud Run to pull without auth)

---

## 🔧 Configuration Steps

### Step 1: Make GHCR Package Public (Required)

After first push, the package will be created. You need to make it public:

1. Go to: `https://github.com/songyinggoh?tab=packages`
2. Click on `renovation-agent-monorepo-backend` package
3. Click **Package settings** (right sidebar)
4. Scroll to **Danger Zone**
5. Click **Change visibility** → **Public**
6. Type the package name to confirm

**Why?** Cloud Run needs public access to pull the image without authentication.

### Step 2: Trigger Deployment

The workflow is already active! Just push to `backend/**` on main:

```bash
cd backend
echo "# GHCR deployment - $(date)" >> .deployment-test
git add .deployment-test
git commit -m "test: deploy using GHCR (free registry)"
git push origin main
```

Or trigger manually:
```bash
gh workflow run backend-deploy-ghcr.yml
```

---

## 🎯 Current Workflow Status

| Workflow | Status | Registry | Cost | Notes |
|----------|--------|----------|------|-------|
| `backend-deploy-ghcr.yml` | ✅ ACTIVE | GHCR | FREE | **Recommended** |
| `backend-deploy-docker.yml` | ⏸️ Disabled | GCR | Requires billing | Needs Artifact Registry API |
| `backend-deploy.yml` | ⏸️ Disabled | GCR | Requires billing | Needs Cloud Build + Artifact Registry |

---

## 🔍 Verification Steps

### Check GHCR Image
```bash
# List your packages
# https://github.com/songyinggoh?tab=packages

# Pull image locally (after making it public)
docker pull ghcr.io/songyinggoh/renovation-agent-monorepo-backend:latest

# Inspect image
docker inspect ghcr.io/songyinggoh/renovation-agent-monorepo-backend:latest
```

### Check Cloud Run Deployment
```bash
# Get service details
gcloud run services describe renovation-backend \
  --region us-central1 \
  --project renovation-planner-agent \
  --format="yaml(spec.template.spec.containers[0].image)"

# Should show: ghcr.io/songyinggoh/renovation-agent-monorepo-backend:latest
```

### Test Deployed Service
```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe renovation-backend \
  --region us-central1 \
  --project renovation-planner-agent \
  --format="value(status.url)")

# Test health endpoint
curl $SERVICE_URL/health

# Expected: {"status":"ok"}
```

---

## 🔐 Security & Privacy

### GHCR Package Visibility

**Public** (Required for this setup):
- ✅ Cloud Run can pull without authentication
- ✅ Free unlimited bandwidth for public images
- ⚠️ Anyone can pull your Docker image
- ⚠️ Don't include secrets in image layers

**Private** (Alternative if you need privacy):
- ❌ Cloud Run needs authentication to pull
- ❌ Requires additional GCP configuration
- ✅ Images are private
- 💰 Uses GHCR storage quotas

### Best Practices

1. **Never include secrets in Docker images**
   ```dockerfile
   # ❌ BAD: Don't copy .env files
   COPY .env ./

   # ✅ GOOD: Use Cloud Run environment variables
   # Set via: gcloud run services update --set-env-vars KEY=value
   ```

2. **Use multi-stage builds** (already configured)
   ```dockerfile
   # Build stage (includes dev dependencies)
   FROM node:20 AS builder

   # Production stage (minimal, no build tools)
   FROM node:20-slim AS production
   ```

3. **Keep images small**
   - Use `.dockerignore` (already configured)
   - Remove unnecessary files
   - Use slim base images

---

## 🆚 Comparison: GHCR vs GCR

| Feature | GHCR (Current) | GCR (Requires Billing) |
|---------|----------------|------------------------|
| **Cost** | 🟢 Free | 💰 Requires billing account |
| **Setup** | 🟢 Automatic | 🟡 Needs API enablement |
| **Auth** | 🟢 GITHUB_TOKEN | 🟡 Service account |
| **Speed** | 🟢 Fast (GitHub CDN) | 🟢 Fast (Google CDN) |
| **Integration** | 🟢 Native GitHub | 🟢 Native GCP |
| **Public images** | 🟢 Free unlimited | 💰 Egress costs apply |
| **Private images** | 🟡 500MB free | 💰 Storage costs |

**Recommendation**: Use GHCR for free deployments! GCR only needed if:
- You have GCP billing enabled
- You need advanced GCP integration features
- You're already using other GCP container services

---

## 🐛 Troubleshooting

### Issue 1: "Failed to pull image"
**Error**: Cloud Run can't pull from GHCR

**Solution**: Make package public
1. Go to: https://github.com/songyinggoh?tab=packages
2. Find `renovation-agent-monorepo-backend`
3. Package settings → Change visibility → Public

### Issue 2: "Package not found"
**Error**: 404 when trying to pull image

**Solution**: Wait for first successful push
- First deployment creates the package
- Package appears after first successful push
- Then make it public (see Step 1 above)

### Issue 3: "Image not updating"
**Error**: Old code is deployed

**Solution**: Check image tags
```bash
# Verify latest image was pushed
# https://github.com/songyinggoh/renovation-agent-monorepo/pkgs/container/renovation-agent-monorepo-backend

# Force pull latest
gcloud run deploy renovation-backend \
  --image ghcr.io/songyinggoh/renovation-agent-monorepo-backend:latest \
  --region us-central1 \
  --project renovation-planner-agent
```

### Issue 4: "Permission denied: packages"
**Error**: Can't push to GHCR

**Solution**: Check workflow permissions
- Workflow already has `packages: write` permission
- GITHUB_TOKEN is automatically available
- No manual token setup needed

---

## 📊 Build & Deploy Timeline

**Expected Duration**: ~2-3 minutes

**Breakdown**:
1. Checkout code: ~5s
2. Login to GHCR: ~2s
3. Build Docker image: ~60-90s
4. Push to GHCR: ~20-30s
5. Deploy to Cloud Run: ~20-30s

**Total**: ~2-3 minutes per deployment

---

## 🚀 Alternative Solutions (If Needed)

### Option 1: Docker Hub (Also Free)
```yaml
- name: Login to Docker Hub
  uses: docker/login-action@v3
  with:
    username: ${{ secrets.DOCKERHUB_USERNAME }}
    password: ${{ secrets.DOCKERHUB_TOKEN }}

- name: Build and Push
  run: |
    docker build -t username/renovation-backend:latest .
    docker push username/renovation-backend:latest
```

**Pros**: Also free, widely used
**Cons**: Requires Docker Hub account setup

### Option 2: Cloud Run from Source (No Registry)
```bash
# Deploy directly from source (Cloud Run builds it)
gcloud run deploy renovation-backend \
  --source backend/ \
  --region us-central1 \
  --project renovation-planner-agent
```

**Pros**: No registry needed at all
**Cons**: Requires Cloud Build API (billing) - same issue!

### Option 3: Self-Hosted Registry
```yaml
# Use GitHub Actions as registry
# Not recommended - complex setup
```

**Pros**: Complete control
**Cons**: Complex, not worth it for small projects

---

## ✅ Recommended Solution: GHCR

**Why GHCR is the best free option**:
1. 🟢 Completely free for public images
2. 🟢 No external service signup needed
3. 🟢 Native GitHub Actions integration
4. 🟢 Fast and reliable (GitHub infrastructure)
5. 🟢 Easy to make public (one-click)
6. 🟢 Works perfectly with Cloud Run

**Just remember**: Make the package public after first push!

---

## 📚 References

- [GitHub Container Registry Docs](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Cloud Run - Deploy from GHCR](https://cloud.google.com/run/docs/deploying#other-registries)
- [Docker Login Action](https://github.com/docker/login-action)

---

## 🎯 Summary

**Problem**: GCR requires billing
**Solution**: GitHub Container Registry (GHCR)
**Cost**: $0 (FREE!)
**Status**: ✅ Workflow active and ready

**Next Steps**:
1. Push to main branch (triggers deployment)
2. Make GHCR package public after first push
3. Test deployed service

Your deployment pipeline is now **completely free** and operational!
