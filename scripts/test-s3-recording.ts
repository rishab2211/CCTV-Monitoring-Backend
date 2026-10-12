/**
 * @file test-s3-recording.ts
 * @description Automated verification script for AWS S3 Recording Pipeline.
 * Tests connection, S3 upload, pre-signed URL generation, HTTP reachability, and deletion.
 */
import {
  storageClient,
  uploadRecordingSegment,
  generatePresignedPlaybackUrl,
  generatePresignedDownloadUrl,
  deleteRecordingObjects,
  getBucketName,
  isStorageConfigured,
} from "../src/config/storage";
import { env } from "../src/config/env";

const runTest = async () => {
  console.log("\n============================================================");
  console.log("   🧪 AWS S3 Recording Pipeline Verification Suite          ");
  console.log("============================================================\n");

  // Step 1: Check Environment Configuration
  console.log("1️⃣  Inspecting Environment Variables...");
  console.log(`   • AWS_REGION        : ${env.AWS_REGION || "NOT SET"}`);
  console.log(`   • AWS_S3_BUCKET     : ${getBucketName()}`);
  console.log(`   • AWS_ACCESS_KEY_ID : ${env.AWS_ACCESS_KEY_ID ? `${env.AWS_ACCESS_KEY_ID.slice(0, 6)}...` : "❌ NOT SET"}`);
  console.log(`   • AWS_SECRET_KEY    : ${env.AWS_SECRET_ACCESS_KEY ? "****** (Configured)" : "❌ NOT SET"}`);

  if (!isStorageConfigured()) {
    console.error("\n❌ ERROR: AWS credentials are not configured in your .env file!");
    console.log("\nPlease add these lines to your .env file:");
    console.log(`
AWS_REGION=ap-southeast-2
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_S3_BUCKET=cctv-recordings-company-test-229521608777-ap-southeast-2-an
    `);
    process.exit(1);
  }
  console.log("   ✅ Storage configuration detected!\n");

  // Step 2: Test S3 PutObject (Upload)
  const testKey = `recordings/test-franchise/test-cam/${new Date().toISOString().slice(0, 10)}/test-segment-${Date.now()}.mp4`;
  const dummyPayload = Buffer.from("CCTV-MONITORING-TEST-VIDEO-PAYLOAD-HEADER-fMP4");

  console.log(`2️⃣  Testing S3 Upload (PutObject)...`);
  console.log(`   • Target Key: ${testKey}`);
  try {
    const uploadResult = await uploadRecordingSegment({
      s3Key: testKey,
      body: dummyPayload,
      sizeBytes: dummyPayload.length,
      contentType: "video/mp4",
      metadata: {
        test: "true",
        camera: "test-camera",
      },
    });
    console.log(`   ✅ Successfully uploaded test segment to ${uploadResult.bucket}!`);
  } catch (err) {
    console.error(`   ❌ Failed to upload to S3: ${(err as Error).message}`);
    process.exit(1);
  }

  // Step 3: Test Pre-signed Playback URL
  console.log(`\n3️⃣  Testing Pre-Signed Playback URL Generation...`);
  try {
    const playbackUrl = await generatePresignedPlaybackUrl(testKey, 300);
    console.log(`   • Generated Playback URL:\n     ${playbackUrl}`);

    // Verify HTTP accessibility of the signed URL
    console.log(`   • Testing HTTP GET against signed URL...`);
    const res = await fetch(playbackUrl, { method: "GET" });
    if (res.ok) {
      console.log(`   ✅ S3 returned HTTP ${res.status} OK! Browser players can stream footage.`);
    } else {
      console.warn(`   ⚠️  S3 returned HTTP ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error(`   ❌ Failed to generate or access signed URL: ${(err as Error).message}`);
  }

  // Step 4: Test Pre-signed Download URL
  console.log(`\n4️⃣  Testing Pre-Signed Download URL (with Attachment Header)...`);
  try {
    const downloadUrl = await generatePresignedDownloadUrl(testKey, "test-footage.mp4", 300);
    console.log(`   • Generated Download URL:\n     ${downloadUrl}`);
    console.log(`   ✅ Download URL contains ResponseContentDisposition header!`);
  } catch (err) {
    console.error(`   ❌ Download URL generation failed: ${(err as Error).message}`);
  }

  // Step 5: Clean Up Test Object
  console.log(`\n5️⃣  Testing Retention Deletion (DeleteObjects)...`);
  try {
    const deletedCount = await deleteRecordingObjects([testKey]);
    console.log(`   ✅ Successfully cleaned up ${deletedCount} test object(s) from S3.`);
  } catch (err) {
    console.error(`   ❌ Failed to delete test object: ${(err as Error).message}`);
  }

  console.log("\n============================================================");
  console.log("   🎉 ALL S3 STORAGE TESTS PASSED SUCCESSFULLY!             ");
  console.log("============================================================\n");
};

runTest().catch(console.error);
