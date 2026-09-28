#!/usr/bin/env bash
# Provision the CLS production VM on Oracle Cloud Always Free (Ampere A1)
# from scratch: VCN + internet gateway + public subnet + security rules for
# 22/80/443, then an Arm64 Ubuntu 24.04 instance.
#
# Where to run:
#   - OCI Cloud Shell (browser, no local install), or
#   - any Linux/Mac with the `oci` CLI and API credentials configured.
#   It does NOT run on the VM itself and is not shipped to the VM.
#
# Before running:
#   1. Open the OCI account, sign in to the home region.
#   2. With `oci` configured, provide:
#        OCI_COMPARTMENT = root compartment OCID (or child, just one level)
#        VM_PUBLIC_KEY   = path to a PUBLIC ssh key (see cls_oci_ed25519.pub)
#   3. Optional overrides:
#        OCI_PROFILE     (default DEFAULT)
#        VM_NAME         (default cls-facility-ubuntu)
#        VM_SHAPE        (default VM.Standard.A1.Flex)
#        VM_OCPUS        (default 4, the Always Free per-account cap)
#        VM_MEMORY_GB    (default 24)
#        VM_BOOT_GB      (default 100)
#        VM_ADMIN_USER   (default ubuntu)
#        VM_CIDR_VCN     (default 10.0.0.0/16)
#        VM_CIDR_SUB     (default 10.0.0.0/24)
#        DRY_RUN=1       prints the commands without executing
#
# Notes:
#   - Always Free A1 capacity is regional and can run out; on failure pick a
#     different availability domain / region, or re-run later.
#   - Ubuntu for A1 can require subscribing to the Ubuntu image in the
#     marketplace first; the lookup below prints a clear pointer if none found.

set -euo pipefail

oci_() {
  if [ "${DRY_RUN:-0}" = "1" ]; then
    echo "oci $*"
    return 0
  fi
  local profile=()
  if [ -n "${OCI_PROFILE:-}" ]; then profile=("--profile" "$OCI_PROFILE"); fi
  oci "${profile[@]}" "$@"
}

die() {
  echo "provision-oci: $*" >&2
  exit 1
}

: "${OCI_COMPARTMENT:?set OCI_COMPARTMENT to the compartment OCID}"
: "${VM_PUBLIC_KEY:?set VM_PUBLIC_KEY to an ssh .pub file path}"
[ -f "$VM_PUBLIC_KEY" ] || die "public key not found: $VM_PUBLIC_KEY"
command -v oci >/dev/null 2>&1 || die "oci CLI not found (run in Cloud Shell or install the CLI)"

VM_NAME="${VM_NAME:-cls-facility-ubuntu}"
VM_SHAPE="${VM_SHAPE:-VM.Standard.A1.Flex}"
VM_OCPUS="${VM_OCPUS:-4}"
VM_MEMORY_GB="${VM_MEMORY_GB:-24}"
VM_BOOT_GB="${VM_BOOT_GB:-100}"
VM_ADMIN_USER="${VM_ADMIN_USER:-ubuntu}"
VM_CIDR_VCN="${VM_CIDR_VCN:-10.0.0.0/16}"
VM_CIDR_SUB="${VM_CIDR_SUB:-10.0.0.0/24}"
SUB_DNS_LABEL="${SUB_DNS_LABEL:-cls}"
VCN_DNS_LABEL="${VCN_DNS_LABEL:-cls}"
ROUTE_NAME_SUFFIX="${ROUTE_NAME_SUFFIX:-cls}"

echo ">> identity check"
oci_ iam compartment get --compartment-id "$OCI_COMPARTMENT" --query 'data.name' >/dev/null

echo ">> VCN ${VM_CIDR_VCN}"
VCN=$(oci_ network vcn create \
  --compartment-id "$OCI_COMPARTMENT" \
  --cidr-blocks "[\"$VM_CIDR_VCN\"]" \
  --display-name "$VM_NAME-vcn" \
  --dns-label "$VCN_DNS_LABEL" \
  --query 'data.id' --raw-output)
echo "   vcn=$VCN"

echo ">> internet gateway"
IGW=$(oci_ network internet-gateway create \
  --compartment-id "$OCI_COMPARTMENT" \
  --vcn-id "$VCN" \
  --is-enabled true \
  --display-name "$VM_NAME-igw" \
  --query 'data.id' --raw-output)
echo "   igw=$IGW"

echo ">> route table (default -> igw)"
RT="[{\"cidrBlock\": \"0.0.0.0/0\", \"networkEntityId\": \"${IGW}\"}]"
RT=$(oci_ network route-table create \
  --compartment-id "$OCI_COMPARTMENT" \
  --vcn-id "$VCN" \
  --route-rules "$RT" \
  --display-name "$VM_NAME-rt-$ROUTE_NAME_SUFFIX" \
  --query 'data.id' --raw-output)
echo "   rt=$RT"

echo ">> public subnet ${VM_CIDR_SUB}"
SUBNET=$(oci_ network subnet create \
  --compartment-id "$OCI_COMPARTMENT" \
  --vcn-id "$VCN" \
  --cidr-block "$VM_CIDR_SUB" \
  --route-table-id "$RT" \
  --dns-label "$SUB_DNS_LABEL" \
  --display-name "$VM_NAME-subnet" \
  --query 'data.id' --raw-output)
echo "   subnet=$SUBNET"

echo ">> security list (22/80/443 in, all out)"
INGRESS='[{"cidrBlock":"0.0.0.0/0","protocol":"6","tcpOptions":{"destinationPortRange":{"max":22,"min":22}}},{"cidrBlock":"0.0.0.0/0","protocol":"6","tcpOptions":{"destinationPortRange":{"max":80,"min":80}}},{"cidrBlock":"0.0.0.0/0","protocol":"6","tcpOptions":{"destinationPortRange":{"max":443,"min":443}}}]'
EGRESS='[{"cidrBlock":"0.0.0.0/0","protocol":"all"}]'
if [ "${DRY_RUN:-0}" != "1" ]; then
  oci network security-list create \
    --compartment-id "$OCI_COMPARTMENT" \
    --vcn-id "$VCN" \
    --ingress-security-rules "$INGRESS" \
    --egress-security-rules "$EGRESS" \
    --display-name "$VM_NAME-security" >/dev/null
  echo "   security-list=$VM_NAME-security"
else
  echo "oci network security-list create --compartment-id $OCI_COMPARTMENT --vcn-id $VCN --ingress-security-rules ... --egress-security-rules ... --display-name $VM_NAME-security"
fi

echo ">> Ubuntu arm64 image (marketplace lookalike listing)"
# Marketplace Ubuntu images appear in this listing only after subscribing to
# the image in the console. If empty, subscribe to "Canonical Ubuntu 24.04"
# (A1/arm64) at: Console -> Marketplace -> then re-run.
IMAGE=$(oci_ compute image list \
  --compartment-id "$OCI_COMPARTMENT" \
  --shape "$VM_SHAPE" \
  --operating-system Ubuntu \
  --sort-by TIMECREATED \
  --query 'sort_by(data,&"time-created")[-1:][0].id' --raw-output 2>/dev/null \
  | tr -d '[]"' || true)
if [ -z "$IMAGE" ] || [ "$IMAGE" = "null" ]; then
  echo
  echo "!! No Ubuntu arm64 image found for shape $VM_SHAPE."
  echo "   In the Console: Marketplace -> All Applications -> 'Canonical Ubuntu 24.04' ->"
  echo "   select the A1/ARM64 version, subscribe / accept, then re-run this script."
  echo "   (Oracle Linux arm64 images are also fine for bootstrap-ubuntu.sh, but the"
  echo "   script targets Ubuntu/Debian apt commands.)"
  echo "   Continuing without launching the instance; network resources above remain."
  exit 0
fi
echo "   image=$IMAGE"

echo ">> instance ${VM_NAME} (${VM_SHAPE} ${VM_OCPUS} OCPU / ${VM_MEMORY_GB} GB)"
METADATA_FILE="$(mktemp)"
printf '{"ssh_authorized_keys": "%s"}' "$(<"$VM_PUBLIC_KEY")" > "$METADATA_FILE"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "oci compute instance launch --compartment-id $OCI_COMPARTMENT --shape $VM_SHAPE --shape-config-ocpus $VM_OCPUS --shape-config-memory-in-gbs $VM_MEMORY_GB --subnet-id $SUBNET --availability-domain <AD> --image-id $IMAGE --display-name $VM_NAME --assign-public-ip true --metadata @$METADATA_FILE --wait-for-state RUNNING"
  rm -f "$METADATA_FILE"
  exit 0
fi

AD=$(oci iam availability-domain list \
  --compartment-id "$OCI_COMPARTMENT" \
  --query 'data[0].name' --raw-output)

INSTANCE=$(oci compute instance launch \
  --compartment-id "$OCI_COMPARTMENT" \
  --shape "$VM_SHAPE" \
  --shape-config-ocpus "$VM_OCPUS" \
  --shape-config-memory-in-gbs "$VM_MEMORY_GB" \
  --subnet-id "$SUBNET" \
  --availability-domain "$AD" \
  --image-id "$IMAGE" \
  --display-name "$VM_NAME" \
  --assign-public-ip true \
  --metadata "$METADATA_FILE" \
  --wait-for-state RUNNING \
  --query 'data.id' --raw-output)
rm -f "$METADATA_FILE"
echo "   instance=$INSTANCE"

echo ">> public IP (may take another minute for the VNIC)"
PUBLIC_IP=$(oci compute instance list-vnics \
  --instance-id "$INSTANCE" \
  --query 'data[0]."public-ip"' --raw-output 2>/dev/null || true)
if [ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "null" ]; then
  echo
  echo "=== VM READY ==="
  echo "admin user   : $VM_ADMIN_USER"
  echo "public ip    : $PUBLIC_IP"
  echo "ssh          : ssh -i <private-key> ${VM_ADMIN_USER}@${PUBLIC_IP}"
  echo
  echo "next: scp -r deploy/ and run bootstrap-ubuntu.sh on the VM"
else
  echo "=== VM LAUNCHING — public ip not yet assigned, check the Console ==="
fi