# Deprecated GCP Documentation

**Archived Date**: 2026-02-06

These documents relate to the previous Google Cloud Platform (GCP) deployment strategy which has been replaced with GitHub Container Registry (GHCR).

## Why Archived?

The project infrastructure has been updated to use:
- **GitHub Container Registry (GHCR)** for container images (instead of Google Container Registry)
- **Railway/Render/Fly.io** for backend deployment (instead of Google Cloud Run)
- **Supabase Storage** for all file storage (instead of Google Cloud Storage)

## Archived Files

| File | Original Purpose |
|------|------------------|
| `Cloud_Build_Permission_Fix.md` | Fixing Cloud Build IAM permissions |
| `WIF_Configuration_Verification.md` | Workload Identity Federation setup for GCP |
| `DEPLOYMENT_ISSUE_RESOLUTION.md` | Resolving GCP deployment issues |
| `DEPLOYMENT_SUCCESS_GUIDE.md` | GCP deployment success checklist |
| `Deployment_Status_Report.md` | GCP deployment status tracking |
| `Free_Deployment_Solution.md` | Free-tier GCP deployment options |
| `DEPLOYMENT_QUICK_REFERENCE.md` | Quick reference for GCP deployment |

## Current Infrastructure

For current deployment documentation, refer to:
- `docs/notion/Full System Architecture.md` - Updated architecture using GHCR
- `docs/notion/Project roadmap and phases.md` - Updated project phases
- `.github/workflows/` - Updated CI/CD workflows (to be created for GHCR)
