resource "minio_s3_bucket" "vericura" {
  bucket = "vericura-image-data"
}

resource "minio_s3_bucket" "neurovance" {
  bucket = "vericura-neurovance-collab"
}

resource "minio_s3_bucket" "zenthera" {
  bucket = "vericura-zenthera-collab"
}

resource "minio_s3_object" "vericura_collab" {
  bucket_name  = minio_s3_bucket.vericura.bucket
  object_name  = "collab/touch.txt"
  content      = "Lorem ipsum dolor sit amet."
  content_type = "text/plain"
}

resource "minio_s3_object" "vericura_lab" {
  bucket_name  = minio_s3_bucket.vericura.bucket
  object_name  = "lab/touch.txt"
  content      = "Lorem ipsum dolor sit amet."
  content_type = "text/plain"
}

resource "minio_s3_object" "vericura_ia" {
  bucket_name  = minio_s3_bucket.vericura.bucket
  object_name  = "image-analysis/touch.txt"
  content      = "Lorem ipsum dolor sit amet."
  content_type = "text/plain"
}


data "minio_iam_policy_document" "vericura_policy_doc" {
  statement {
    effect = "Allow"

    actions = [
      "s3:ListBucket",
      "s3:GetObject"
    ]

    resources = [
      minio_s3_bucket.vericura.arn,
      "${minio_s3_bucket.vericura.arn}/*"
    ]

    condition {
      test     = "ForAnyValue:StringEquals"
      variable = "jwt:groups"
      values = [
        "/VeriCura/Employees",
        "/VeriCura/Lab",
        "/VeriCura/ImageAnalysis"
      ]
    }
  }

  statement {
    effect = "Allow"

    actions = [
      "s3:ListBucket",
      "s3:GetObject"
    ]

    resources = [
      minio_s3_bucket.neurovance.arn,
      "${minio_s3_bucket.neurovance.arn}/*"
    ]

    condition {
      test     = "ForAnyValue:StringEquals"
      variable = "jwt:groups"
      values = [
        "/NeurovanceTherapeutics/Employees"
      ]
    }
  }

  statement {
    effect = "Allow"

    actions = [
      "s3:ListBucket",
      "s3:GetObject"
    ]

    resources = [
      minio_s3_bucket.zenthera.arn,
      "${minio_s3_bucket.zenthera.arn}/*"
    ]

    condition {
      test     = "ForAnyValue:StringEquals"
      variable = "jwt:groups"
      values = [
        "/ZentheraPharma/Employees"
      ]
    }
  }
}

resource "minio_iam_policy" "vericura_policy" {
  name   = "vericura_policy"
  policy = data.minio_iam_policy_document.vericura_policy_doc.json
}
