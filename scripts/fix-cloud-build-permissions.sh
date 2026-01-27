#!/bin/bash
# Fix Cloud Build Permissions for WIF Service Account
# Run this script with gcloud CLI authenticated as a project owner

set -e

PROJECT_ID="renovation-planner-agent"
SERVICE_ACCOUNT="songyinggoh@renovation-planner-agent.iam.gserviceaccount.com"

echo "========================================"
echo "Cloud Build Permission Fix Script"
echo "========================================"
echo ""
echo "Project: $PROJECT_ID"
echo "Service Account: $SERVICE_ACCOUNT"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI not found"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if authenticated
echo "🔍 Checking authentication..."
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "❌ Error: Not authenticated with gcloud"
    echo "Run: gcloud auth login"
    exit 1
fi

CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)
echo "✓ Authenticated (Current project: $CURRENT_PROJECT)"
echo ""

# Set project
echo "📋 Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

# Enable required APIs
echo ""
echo "🔧 Enabling required APIs..."
echo "  - Cloud Build API"
echo "  - Service Usage API"
echo "  - Storage API"
echo ""

gcloud services enable cloudbuild.googleapis.com \
  serviceusage.googleapis.com \
  storage.googleapis.com \
  --project=$PROJECT_ID

echo "✓ APIs enabled"
echo ""

# Add IAM roles
echo "🔐 Adding IAM roles to service account..."
echo ""

echo "  [1/3] Adding Cloud Build Editor role..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/cloudbuild.builds.editor" \
  --condition=None \
  > /dev/null 2>&1

echo "  ✓ Cloud Build Editor added"

echo "  [2/3] Adding Service Usage Consumer role..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/serviceusage.serviceUsageConsumer" \
  --condition=None \
  > /dev/null 2>&1

echo "  ✓ Service Usage Consumer added"

echo "  [3/3] Adding Storage Admin role..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/storage.admin" \
  --condition=None \
  > /dev/null 2>&1

echo "  ✓ Storage Admin added"
echo ""

# Verify roles
echo "🔍 Verifying service account roles..."
echo ""

ROLES=$(gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$SERVICE_ACCOUNT" \
  --format="value(bindings.role)")

echo "Current roles for $SERVICE_ACCOUNT:"
echo "$ROLES" | while read -r role; do
    echo "  ✓ $role"
done
echo ""

# Check for required roles
REQUIRED_ROLES=(
    "roles/cloudbuild.builds.editor"
    "roles/serviceusage.serviceUsageConsumer"
    "roles/storage.admin"
    "roles/run.admin"
)

MISSING_ROLES=()
for role in "${REQUIRED_ROLES[@]}"; do
    if ! echo "$ROLES" | grep -q "$role"; then
        MISSING_ROLES+=("$role")
    fi
done

if [ ${#MISSING_ROLES[@]} -eq 0 ]; then
    echo "✅ All required roles are present!"
else
    echo "⚠️  Missing roles:"
    for role in "${MISSING_ROLES[@]}"; do
        echo "  ❌ $role"
    done
    echo ""
    echo "You may need to add these manually:"
    for role in "${MISSING_ROLES[@]}"; do
        echo "gcloud projects add-iam-policy-binding $PROJECT_ID \\"
        echo "  --member=\"serviceAccount:$SERVICE_ACCOUNT\" \\"
        echo "  --role=\"$role\""
        echo ""
    done
fi

echo ""
echo "========================================"
echo "✅ Permission fix complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Push a change to backend/** on main branch"
echo "2. Check GitHub Actions for successful deployment"
echo "3. Verify service at: https://console.cloud.google.com/run?project=$PROJECT_ID"
echo ""
