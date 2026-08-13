-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "avatar" TEXT,
    "profile_image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'student',
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "phone" TEXT,
    "designation" TEXT,
    "bio" TEXT,
    "contact_email" TEXT,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "email_notifications" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_id" TEXT,
    "target_type" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "platform_name" TEXT NOT NULL DEFAULT 'THE GATEHUB',
    "platform_logo" TEXT,
    "favicon_url" TEXT,
    "contact_email" TEXT,
    "support_email" TEXT,
    "support_phone" TEXT,
    "website_url" TEXT,
    "company_name" TEXT,
    "company_gstin" TEXT,
    "company_address" TEXT,
    "footer_text" TEXT,
    "maintenance_mode" BOOLEAN NOT NULL DEFAULT false,
    "default_currency" TEXT NOT NULL DEFAULT 'INR',
    "platform_fee_percentage" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "instructor_share_percentage" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "commerce_gst_percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "certificate_issuer_name" TEXT,
    "certificate_designation" TEXT,
    "certificate_prefix" TEXT,
    "certificate_signature_url" TEXT,
    "certificate_seal_url" TEXT,
    "certificate_background_url" TEXT,
    "payment_gateway" TEXT NOT NULL DEFAULT 'razorpay',
    "ai_authoring_enabled" BOOLEAN NOT NULL DEFAULT true,
    "ai_model_name" TEXT,
    "ai_provider" TEXT NOT NULL DEFAULT 'openai',
    "ai_lu_builder_enabled" BOOLEAN NOT NULL DEFAULT true,
    "ai_tutor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "ai_quiz_generator_enabled" BOOLEAN NOT NULL DEFAULT true,
    "ai_project_evaluator_enabled" BOOLEAN NOT NULL DEFAULT false,
    "ai_interview_assistant_enabled" BOOLEAN NOT NULL DEFAULT false,
    "student_registration_enabled" BOOLEAN NOT NULL DEFAULT true,
    "instructor_registration_enabled" BOOLEAN NOT NULL DEFAULT true,
    "instructor_auto_approve" BOOLEAN NOT NULL DEFAULT true,
    "email_verification_enabled" BOOLEAN NOT NULL DEFAULT false,
    "admin_creation_enabled" BOOLEAN NOT NULL DEFAULT false,
    "lu_publishing_enabled" BOOLEAN NOT NULL DEFAULT true,
    "lu_require_review" BOOLEAN NOT NULL DEFAULT false,
    "lu_allow_public" BOOLEAN NOT NULL DEFAULT true,
    "lu_require_enrollment" BOOLEAN NOT NULL DEFAULT true,
    "lu_require_payment" BOOLEAN NOT NULL DEFAULT true,
    "lu_allow_project_submissions" BOOLEAN NOT NULL DEFAULT true,
    "lu_allow_resubmissions" BOOLEAN NOT NULL DEFAULT true,
    "lu_enable_auto_grading" BOOLEAN NOT NULL DEFAULT false,
    "session_timeout_minutes" INTEGER NOT NULL DEFAULT 1440,
    "jwt_expiry_hours" INTEGER NOT NULL DEFAULT 168,
    "max_login_attempts" INTEGER NOT NULL DEFAULT 5,
    "password_min_length" INTEGER NOT NULL DEFAULT 8,
    "require_password_number" BOOLEAN NOT NULL DEFAULT true,
    "require_password_special" BOOLEAN NOT NULL DEFAULT true,
    "rate_limiting_enabled" BOOLEAN NOT NULL DEFAULT true,
    "captcha_enabled" BOOLEAN NOT NULL DEFAULT false,
    "smtp_host" TEXT,
    "smtp_port" INTEGER,
    "smtp_username" TEXT,
    "smtp_password" TEXT,
    "email_templates" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_version" INTEGER NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "last_active" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginHistory" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "feature" TEXT NOT NULL,
    "tokens" INTEGER,
    "cost" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LatexDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pdf_url" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LatexDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "group_name" TEXT,
    "icon" TEXT,
    "parent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "thumbnail" TEXT,
    "banner_url" TEXT,
    "banner_type" TEXT,
    "difficulty" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "average_rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "category" TEXT,
    "subcategory" TEXT,
    "category_id" TEXT,
    "subcategory_id" TEXT,
    "ai_landing_data" TEXT,
    "ai_content" TEXT,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "course_id" TEXT,
    "learning_universe_id" TEXT,
    "product_type" TEXT NOT NULL,
    "product_title" TEXT NOT NULL,
    "instructor_id" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "discount_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "coupon_code" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "razorpay_order_id" TEXT,
    "order_kind" TEXT NOT NULL DEFAULT 'single',
    "bundle_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discount_type" TEXT NOT NULL,
    "discount_value" DOUBLE PRECISION NOT NULL,
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "min_order_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "course_id" TEXT,
    "learning_universe_id" TEXT,
    "product_type" TEXT,
    "first_purchase_only" BOOLEAN NOT NULL DEFAULT false,
    "max_discount" DOUBLE PRECISION,
    "category_id" TEXT,
    "global_scope" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "discount_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "billing_name" TEXT,
    "billing_email" TEXT,
    "billing_address" TEXT,
    "gstin" TEXT,
    "cgst_amount" DOUBLE PRECISION DEFAULT 0,
    "sgst_amount" DOUBLE PRECISION DEFAULT 0,
    "igst_amount" DOUBLE PRECISION DEFAULT 0,
    "hsn_sac" TEXT DEFAULT '999293',
    "line_items" JSONB NOT NULL,
    "pdf_path" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "transaction_id" TEXT,
    "user_id" TEXT NOT NULL,
    "order_id" TEXT,
    "course_id" TEXT,
    "learning_universe_id" TEXT,
    "product_type" TEXT NOT NULL DEFAULT 'course',
    "gateway" TEXT NOT NULL DEFAULT 'razorpay',
    "razorpay_order_id" TEXT,
    "instructor_id" TEXT,
    "platform_fee" DOUBLE PRECISION,
    "instructor_earning" DOUBLE PRECISION,
    "subtotal" DOUBLE PRECISION,
    "discount_amount" DOUBLE PRECISION DEFAULT 0,
    "tax_amount" DOUBLE PRECISION DEFAULT 0,
    "coupon_code" TEXT,
    "refund_amount" DOUBLE PRECISION,
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "product_type" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "thumbnail" TEXT,
    "banner" TEXT,
    "instructor_id" TEXT,
    "category_id" TEXT,
    "course_id" TEXT,
    "learning_universe_id" TEXT,
    "bundle_id" TEXT,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount_price" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "tax_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "cart_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT,
    "product_type" TEXT NOT NULL,
    "product_title" TEXT NOT NULL,
    "course_id" TEXT,
    "learning_universe_id" TEXT,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "line_total" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "order_id" TEXT,
    "user_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "admin_note" TEXT,
    "gateway_ref" TEXT,
    "processed_by" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstructorPayoutProfile" (
    "id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "bank_name" TEXT,
    "account_holder" TEXT,
    "account_number" TEXT,
    "ifsc" TEXT,
    "upi_id" TEXT,
    "pan_number" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstructorPayoutProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutWithdrawal" (
    "id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "method" TEXT NOT NULL DEFAULT 'bank',
    "admin_note" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductBundle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnail" TEXT,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "instructor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleItem" (
    "id" TEXT NOT NULL,
    "bundle_id" TEXT NOT NULL,
    "course_id" TEXT,
    "learning_universe_id" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "billing_cycle" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "product_ids" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftPurchase" (
    "id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "recipient_id" TEXT,
    "message" TEXT,
    "product_id" TEXT,
    "course_id" TEXT,
    "learning_universe_id" TEXT,
    "order_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduled_at" TIMESTAMP(3),
    "redeemed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "reward_points" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referral_code_id" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "referred_user_id" TEXT NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "certificate_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "certificate_title" TEXT,
    "certificate_body" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completion_date" TIMESTAMP(3),
    "url" TEXT,
    "pdf_path" TEXT,
    "verification_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" TEXT,
    "revoke_reason" TEXT,
    "metadata" JSONB,
    "reissued_from_id" TEXT,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "course_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lecture" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'video',
    "content" TEXT,
    "video_url" TEXT,
    "video_type" TEXT,
    "video_captions" JSONB,
    "notes_pdf_url" TEXT,
    "compiled_pdf_url" TEXT,
    "duration" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "section_id" TEXT NOT NULL,
    "quiz_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lecture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "size" INTEGER,
    "lecture_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LectureMedia" (
    "id" TEXT NOT NULL,
    "lecture_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LectureMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "total_marks" INTEGER NOT NULL DEFAULT 0,
    "author_id" TEXT,
    "subject" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "favorited" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizVersion" (
    "id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "difficulty" TEXT,
    "points" INTEGER,
    "marks" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "explanation" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "quiz_id" TEXT NOT NULL,
    "bank_question_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Option" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "question_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "total_marks" INTEGER NOT NULL,
    "answers" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "is_completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseProgress" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "percent" INTEGER NOT NULL DEFAULT 0,
    "last_accessed" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LectureProgress" (
    "id" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "course_progress_id" TEXT NOT NULL,
    "lecture_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LectureProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_reviews" (
    "id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "review_text" TEXT,
    "student_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "course_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "course_id" TEXT,
    "learning_universe_id" TEXT,
    "product_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentNote" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "lecture_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LatexProject" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "lecture_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LatexProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LatexProjectVersion" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL DEFAULT 'auto-save',
    "publish_type" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "dsl_snapshot" TEXT NOT NULL,
    "file_inventory" JSONB,
    "asset_inventory" JSONB,
    "project_metadata" JSONB,
    "learning_universe_id" TEXT,
    "resource_course_id" TEXT,
    "author_id" TEXT,
    "is_safety_snapshot" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LatexProjectVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LatexProjectTimelineEvent" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LatexProjectTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LatexFile" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "is_folder" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT,
    "s3_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LatexFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LatexCollaborator" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LatexCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YjsUpdate" (
    "id" TEXT NOT NULL,
    "doc_name" TEXT NOT NULL,
    "update" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YjsUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YjsSnapshot" (
    "id" TEXT NOT NULL,
    "doc_name" TEXT NOT NULL,
    "state" BYTEA NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YjsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceCourse" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnail" TEXT,
    "instructor_id" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceContent" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "latex_content" TEXT NOT NULL,
    "compiled_html" TEXT NOT NULL,
    "structured_content" JSONB,
    "project_files" JSONB,
    "assets" JSONB,
    "pdf_url" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningUniverse" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT NOT NULL,
    "thumbnail" TEXT,
    "banner_url" TEXT,
    "banner_type" TEXT,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "category_id" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'Beginner',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "language" TEXT NOT NULL DEFAULT 'en',
    "dsl_source" TEXT NOT NULL,
    "structured_data" JSONB NOT NULL,
    "source_project_id" TEXT,
    "published_at" TIMESTAMP(3),
    "current_publish_version_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "instructor_id" TEXT NOT NULL,

    CONSTRAINT "LearningUniverse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningUniversePublishVersion" (
    "id" TEXT NOT NULL,
    "learning_universe_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "dsl_source" TEXT NOT NULL,
    "structured_data" JSONB NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningUniversePublishVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningUniverseAsset" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storedFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "learning_universe_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningUniverseAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningUniverseTrack" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "learning_outcomes" TEXT,
    "career_outcomes" TEXT,
    "difficulty" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "learning_universe_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningUniverseTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningUniverseModule" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "prerequisites" TEXT,
    "learning_outcomes" TEXT,
    "estimated_hours" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "track_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningUniverseModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningUniverseLesson" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "overview_markdown" TEXT,
    "overview_html" TEXT,
    "content_blocks" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "module_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "quiz_id" TEXT,

    CONSTRAINT "LearningUniverseLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningUniverseVideo" (
    "id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'youtube',
    "url" TEXT NOT NULL,
    "title" TEXT,
    "duration" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningUniverseVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningUniversePractice" (
    "id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'python',
    "initial_code" TEXT NOT NULL,
    "expected_output" TEXT,
    "solution" TEXT,
    "hints" TEXT,
    "test_cases" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningUniversePractice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningUniverseProject" (
    "id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'Medium',
    "instructions" TEXT NOT NULL,
    "expected_output" TEXT,
    "success_criteria" TEXT,
    "colab_url" TEXT,
    "github_url" TEXT,
    "dataset_urls" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningUniverseProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningUniverseResource" (
    "id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'link',
    "title" TEXT NOT NULL,
    "url" TEXT,
    "file_url" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningUniverseResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningUniverseEnrollment" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "learning_universe_id" TEXT NOT NULL,
    "publish_version_id" TEXT,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "is_completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LearningUniverseEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningUniverseProgress" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "publish_version_id" TEXT,
    "percent_complete" INTEGER NOT NULL DEFAULT 0,
    "last_lesson_id" TEXT,
    "last_step_id" TEXT,
    "last_accessed" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningUniverseProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL,
    "progress_id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningUniverseStepProgress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "learning_universe_id" TEXT NOT NULL,
    "publish_version_id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "visited" BOOLEAN NOT NULL DEFAULT false,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "time_spent" INTEGER NOT NULL DEFAULT 0,
    "component_state" JSONB NOT NULL DEFAULT '{}',
    "last_visited" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningUniverseStepProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningUniverseCertificate" (
    "id" TEXT NOT NULL,
    "certificate_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "learning_universe_id" TEXT NOT NULL,
    "publish_version_id" TEXT,
    "certificate_title" TEXT,
    "certificate_body" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completion_date" TIMESTAMP(3),
    "url" TEXT,
    "pdf_path" TEXT,
    "verification_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" TEXT,
    "revoke_reason" TEXT,
    "metadata" JSONB,
    "reissued_from_id" TEXT,

    CONSTRAINT "LearningUniverseCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateSequence" (
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CertificateSequence_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "CertificateAuditLog" (
    "id" TEXT NOT NULL,
    "certificate_record_id" TEXT,
    "certificate_public_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'learning_universe',
    "action" TEXT NOT NULL,
    "user_id" TEXT,
    "ip_address" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificateAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningUniverseProjectSubmission" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "github_url" TEXT,
    "colab_url" TEXT,
    "zip_file_url" TEXT,
    "report_pdf_url" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "grade" DOUBLE PRECISION,
    "feedback" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningUniverseProjectSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningUniverseComponentSubmission" (
    "id" TEXT NOT NULL,
    "learning_universe_id" TEXT NOT NULL,
    "publish_version_id" TEXT,
    "lesson_id" TEXT NOT NULL,
    "component_key" TEXT NOT NULL,
    "component_kind" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "grade" DOUBLE PRECISION,
    "feedback" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningUniverseComponentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserIntegration" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "profile_email" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentWorkspaceSnapshot" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "learning_universe_id" TEXT NOT NULL,
    "publish_version_id" TEXT,
    "lesson_id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "workspace_kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "drive_file_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentWorkspaceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentWorkspaceVersion" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "drive_file_id" TEXT,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentWorkspaceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "room_code" TEXT,
    "pin" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'lobby',
    "session_type" TEXT NOT NULL DEFAULT 'live_classroom',
    "source_type" TEXT NOT NULL DEFAULT 'existing_quiz',
    "quiz_id" TEXT NOT NULL,
    "host_user_id" TEXT NOT NULL,
    "course_id" TEXT,
    "lecture_id" TEXT,
    "learning_universe_id" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "scheduled_at" TIMESTAMP(3),
    "cloned_from_id" TEXT,
    "current_question_index" INTEGER NOT NULL DEFAULT -1,
    "question_started_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveParticipant" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT,
    "display_name" TEXT NOT NULL,
    "avatar" TEXT,
    "team_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'online',
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "wrong_count" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quiz_attempt_id" TEXT,
    "current_question_index" INTEGER NOT NULL DEFAULT -1,
    "question_started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "LiveParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveAnswer" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "points_earned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "response_time_ms" INTEGER,
    "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardSnapshot" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "question_index" INTEGER NOT NULL,
    "rankings" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderboardSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionAnalytics" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "total_participants" INTEGER NOT NULL DEFAULT 0,
    "avg_accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_response_time_ms" INTEGER,
    "question_stats" JSONB NOT NULL DEFAULT '[]',
    "drop_off_data" JSONB NOT NULL DEFAULT '[]',
    "heatmap_data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizRoomTemplate" (
    "id" TEXT NOT NULL,
    "host_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "session_type" TEXT NOT NULL DEFAULT 'live_classroom',
    "source_type" TEXT NOT NULL DEFAULT 'existing_quiz',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizRoomTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_library_templates" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cover_gradient" TEXT,
    "cover_image_url" TEXT,
    "category" TEXT NOT NULL,
    "subject" TEXT,
    "grade_level" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "question_count" INTEGER NOT NULL DEFAULT 0,
    "duration_minutes" INTEGER,
    "question_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "source" TEXT NOT NULL DEFAULT 'official',
    "status" TEXT NOT NULL DEFAULT 'published',
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_official" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "author_user_id" TEXT,
    "author_name" TEXT,
    "organization_id" TEXT,
    "quiz_id" TEXT,
    "quiz_snapshot" JSONB,
    "session_settings" JSONB,
    "learning_objectives" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supports_homework" BOOLEAN NOT NULL DEFAULT true,
    "supports_live" BOOLEAN NOT NULL DEFAULT true,
    "supports_ai" BOOLEAN NOT NULL DEFAULT false,
    "supports_media" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'en',
    "rating_avg" DOUBLE PRECISION NOT NULL DEFAULT 4.5,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "bookmark_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "quiz_library_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_library_template_favorites" (
    "user_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_library_template_favorites_pkey" PRIMARY KEY ("user_id","template_id")
);

-- CreateTable
CREATE TABLE "quiz_library_template_usages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "quiz_id" TEXT,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_library_template_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_library_template_versions" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changelog" TEXT,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_library_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizRoomPreferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "defaults" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizRoomPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankQuestion" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "stem" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "difficulty" TEXT,
    "bloom_level" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "language" TEXT NOT NULL DEFAULT 'en',
    "topic" TEXT,
    "subtopic" TEXT,
    "explanation" TEXT,
    "hints" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "references" JSONB NOT NULL DEFAULT '[]',
    "ai_confidence" DOUBLE PRECISION,
    "estimated_seconds" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "course_id" TEXT,
    "learning_universe_id" TEXT,
    "legacy_question_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankQuestionOption" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankQuestionVersion" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankQuestionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankQuestionCollection" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'folder',
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "smart_rules" JSONB,
    "is_template" BOOLEAN NOT NULL DEFAULT false,
    "template_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankQuestionCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankQuestionCollectionItem" (
    "id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankQuestionCollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankQuestionAnalytics" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "times_used" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "avg_accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_time_ms" INTEGER,
    "confusion_score" DOUBLE PRECISION,
    "difficulty_drift" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankQuestionAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankQuestionReview" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "reviewer_id" TEXT,
    "status" TEXT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankQuestionReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankQuestionAIValidation" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "checks" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankQuestionAIValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankQuestionImportJob" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "file_name" TEXT,
    "source_url" TEXT,
    "preview" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankQuestionImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'standard',
    "branding" JSONB NOT NULL DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "parent_id" TEXT,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "department_id" TEXT,
    "role" TEXT NOT NULL DEFAULT 'student',
    "employee_id" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantConfig" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "scoring_rules" JSONB NOT NULL DEFAULT '{}',
    "xp_rules" JSONB NOT NULL DEFAULT '{}',
    "badge_overrides" JSONB NOT NULL DEFAULT '[]',
    "cert_templates" JSONB NOT NULL DEFAULT '[]',
    "feature_flags" JSONB NOT NULL DEFAULT '{}',
    "rules" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "TenantConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "author_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'formative',
    "lifecycle" TEXT NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "total_marks" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "favorited" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "published_version_id" TEXT,
    "legacy_quiz_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentVersion" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "change_log" TEXT,
    "created_by_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentSection" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "title" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AssessmentSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentItem" (
    "id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "marks" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AssessmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessQuestionType" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "schema" JSONB NOT NULL DEFAULT '{}',
    "grader_key" TEXT NOT NULL,
    "renderer_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AssessQuestionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessQuestion" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "department_id" TEXT,
    "author_id" TEXT NOT NULL,
    "type_id" TEXT NOT NULL,
    "stem" TEXT NOT NULL,
    "subject" TEXT,
    "course_id" TEXT,
    "unit" TEXT,
    "chapter" TEXT,
    "topic" TEXT,
    "subtopic" TEXT,
    "learning_outcome" TEXT,
    "difficulty" TEXT,
    "bloom_level" TEXT,
    "estimated_seconds" INTEGER,
    "marks" INTEGER NOT NULL DEFAULT 1,
    "negative_marks" DOUBLE PRECISION,
    "explanation" TEXT,
    "hints" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "concepts" JSONB NOT NULL DEFAULT '[]',
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "aliases" JSONB NOT NULL DEFAULT '[]',
    "placement_tags" JSONB NOT NULL DEFAULT '[]',
    "company_tags" JSONB NOT NULL DEFAULT '[]',
    "skill_tags" JSONB NOT NULL DEFAULT '[]',
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "permission_mode" TEXT NOT NULL DEFAULT 'owner_only',
    "language" TEXT NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "ai_confidence" DOUBLE PRECISION,
    "ai_history_id" TEXT,
    "forked_from_id" TEXT,
    "search_text" TEXT,
    "legacy_bank_id" TEXT,
    "legacy_quiz_q_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessQuestionVersion" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessQuestionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessChoice" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AssessChoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "uploader_id" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "asset_type" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaVariant" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "url" TEXT,

    CONSTRAINT "MediaVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaUsage" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "question_id" TEXT,
    "question_version_id" TEXT,

    CONSTRAINT "MediaUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentDeployment" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "assessment_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "host_id" TEXT,
    "context_type" TEXT,
    "context_id" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduled_at" TIMESTAMP(3),
    "due_at" TIMESTAMP(3),
    "legacy_session_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttempt" (
    "id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "assessment_version_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "reconnect_token" TEXT,
    "shuffle_seed" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "graded_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttemptQuestion" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "question_version_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "marks" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "AssessmentAttemptQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentResponse" (
    "id" TEXT NOT NULL,
    "attempt_question_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "question_version_id" TEXT NOT NULL,
    "participant_id" TEXT,
    "answer" JSONB NOT NULL,
    "is_correct" BOOLEAN,
    "marks_awarded" DOUBLE PRECISION,
    "response_time_ms" INTEGER,
    "graded_by" TEXT,
    "graded_at" TIMESTAMP(3),
    "feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningRecord" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "marks_earned" DOUBLE PRECISION NOT NULL,
    "total_marks" INTEGER NOT NULL,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "wrong_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "topic_mastery" JSONB NOT NULL DEFAULT '{}',
    "bloom_breakdown" JSONB NOT NULL DEFAULT '{}',
    "difficulty_solved" JSONB NOT NULL DEFAULT '{}',
    "weak_concepts" JSONB NOT NULL DEFAULT '[]',
    "strong_concepts" JSONB NOT NULL DEFAULT '[]',
    "time_per_concept" JSONB NOT NULL DEFAULT '{}',
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementRecord" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "xp_earned" INTEGER NOT NULL DEFAULT 0,
    "coins_earned" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "combo" INTEGER NOT NULL DEFAULT 0,
    "session_rank" INTEGER,
    "achievement_points" INTEGER NOT NULL DEFAULT 0,
    "power_ups_used" JSONB NOT NULL DEFAULT '[]',
    "session_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessLiveRoom" (
    "id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "room_code" TEXT,
    "pin" TEXT,
    "status" TEXT NOT NULL DEFAULT 'lobby',
    "current_question_index" INTEGER NOT NULL DEFAULT -1,
    "question_started_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessLiveRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessParticipant" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT,
    "attempt_id" TEXT,
    "display_name" TEXT NOT NULL,
    "avatar" TEXT,
    "team_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'online',
    "engagement_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "learning_correct" INTEGER NOT NULL DEFAULT 0,
    "learning_wrong" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessTeam" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "AssessTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessLeaderboardSnapshot" (
    "id" TEXT NOT NULL,
    "room_id" TEXT,
    "scope_type" TEXT,
    "scope_id" TEXT,
    "period" TEXT,
    "question_index" INTEGER,
    "rankings" JSONB NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessLeaderboardSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessLiveRoomAnalytics" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "total_participants" INTEGER NOT NULL DEFAULT 0,
    "avg_accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_response_time_ms" INTEGER,
    "question_stats" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "AssessLiveRoomAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeworkAssignment" (
    "id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "allow_late" BOOLEAN NOT NULL DEFAULT false,
    "max_attempts" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomeworkAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseAssignment" (
    "id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "course_id" TEXT,
    "lecture_id" TEXT,
    "weight_percent" DOUBLE PRECISION,
    "sync_to_gradebook" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CourseAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessQuestionAnalytics" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "times_used" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "skip_count" INTEGER NOT NULL DEFAULT 0,
    "avg_time_ms" INTEGER,
    "avg_accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discrimination_index" DOUBLE PRECISION,
    "p_value" DOUBLE PRECISION,
    "confusion_score" DOUBLE PRECISION,
    "skip_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "guess_rate" DOUBLE PRECISION,
    "popularity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "health_score" DOUBLE PRECISION,
    "faculty_rating" DOUBLE PRECISION,
    "student_rating" DOUBLE PRECISION,
    "ai_suggested_revision" JSONB,
    "last_used_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessQuestionAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessQuestionRelation" (
    "id" TEXT NOT NULL,
    "parent_question_id" TEXT NOT NULL,
    "child_question_id" TEXT NOT NULL,
    "relation_type" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AssessQuestionRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessQuestionCollection" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "department_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'folder',
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "smart_rules" JSONB,
    "is_template" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessQuestionCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessQuestionCollectionItem" (
    "id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessQuestionCollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGamificationProfile" (
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "total_xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "best_streak" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGamificationProfile_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "XPTransaction" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "source_id" TEXT,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XPTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinTransaction" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "source_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgeDefinition" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "rarity" TEXT NOT NULL DEFAULT 'common',
    "icon" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "xp_reward" INTEGER NOT NULL DEFAULT 0,
    "coin_reward" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BadgeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgeAward" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "badge_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_id" TEXT,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BadgeAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AchievementDefinition" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tiers" JSONB NOT NULL DEFAULT '[]',
    "criteria" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AchievementDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "definition_id" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unlocked_at" TIMESTAMP(3),

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAnalyticsEvent" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "event_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "assessment_id" TEXT,
    "question_id" TEXT,
    "deployment_id" TEXT,
    "attempt_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIHistory" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT,
    "provider" TEXT,
    "prompt" TEXT NOT NULL,
    "prompt_hash" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "confidence" DOUBLE PRECISION,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "edited_by_id" TEXT,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "tokens" INTEGER,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAuditLog" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_deleted_at_idx" ON "User"("deleted_at");

-- CreateIndex
CREATE INDEX "AdminAuditLog_admin_id_idx" ON "AdminAuditLog"("admin_id");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");

-- CreateIndex
CREATE INDEX "AdminAuditLog_target_id_idx" ON "AdminAuditLog"("target_id");

-- CreateIndex
CREATE INDEX "AdminAuditLog_created_at_idx" ON "AdminAuditLog"("created_at");

-- CreateIndex
CREATE INDEX "UserSession_user_id_idx" ON "UserSession"("user_id");

-- CreateIndex
CREATE INDEX "UserSession_user_id_revoked_idx" ON "UserSession"("user_id", "revoked");

-- CreateIndex
CREATE INDEX "LoginHistory_user_id_idx" ON "LoginHistory"("user_id");

-- CreateIndex
CREATE INDEX "LoginHistory_created_at_idx" ON "LoginHistory"("created_at");

-- CreateIndex
CREATE INDEX "AiUsageLog_created_at_idx" ON "AiUsageLog"("created_at");

-- CreateIndex
CREATE INDEX "AiUsageLog_feature_idx" ON "AiUsageLog"("feature");

-- CreateIndex
CREATE INDEX "LatexDocument_user_id_idx" ON "LatexDocument"("user_id");

-- CreateIndex
CREATE INDEX "LatexDocument_updated_at_idx" ON "LatexDocument"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_slug_idx" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_group_name_idx" ON "Category"("group_name");

-- CreateIndex
CREATE INDEX "Course_instructor_id_idx" ON "Course"("instructor_id");

-- CreateIndex
CREATE INDEX "Course_category_id_idx" ON "Course"("category_id");

-- CreateIndex
CREATE INDEX "Course_subcategory_id_idx" ON "Course"("subcategory_id");

-- CreateIndex
CREATE INDEX "Course_status_idx" ON "Course"("status");

-- CreateIndex
CREATE INDEX "Course_created_at_idx" ON "Course"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Order_order_number_key" ON "Order"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_razorpay_order_id_key" ON "Order"("razorpay_order_id");

-- CreateIndex
CREATE INDEX "Order_user_id_idx" ON "Order"("user_id");

-- CreateIndex
CREATE INDEX "Order_course_id_idx" ON "Order"("course_id");

-- CreateIndex
CREATE INDEX "Order_learning_universe_id_idx" ON "Order"("learning_universe_id");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_created_at_idx" ON "Order"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_active_idx" ON "Coupon"("active");

-- CreateIndex
CREATE INDEX "Coupon_expires_at_idx" ON "Coupon"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoice_number_key" ON "Invoice"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_order_id_key" ON "Invoice"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_payment_id_key" ON "Invoice"("payment_id");

-- CreateIndex
CREATE INDEX "Invoice_user_id_idx" ON "Invoice"("user_id");

-- CreateIndex
CREATE INDEX "Invoice_issued_at_idx" ON "Invoice"("issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transaction_id_key" ON "Payment"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_order_id_key" ON "Payment"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_razorpay_order_id_key" ON "Payment"("razorpay_order_id");

-- CreateIndex
CREATE INDEX "Payment_user_id_idx" ON "Payment"("user_id");

-- CreateIndex
CREATE INDEX "Payment_course_id_idx" ON "Payment"("course_id");

-- CreateIndex
CREATE INDEX "Payment_learning_universe_id_idx" ON "Payment"("learning_universe_id");

-- CreateIndex
CREATE INDEX "Payment_instructor_id_idx" ON "Payment"("instructor_id");

-- CreateIndex
CREATE INDEX "Payment_transaction_id_idx" ON "Payment"("transaction_id");

-- CreateIndex
CREATE INDEX "Payment_product_type_idx" ON "Payment"("product_type");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_course_id_key" ON "Product"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "Product_learning_universe_id_key" ON "Product"("learning_universe_id");

-- CreateIndex
CREATE UNIQUE INDEX "Product_bundle_id_key" ON "Product"("bundle_id");

-- CreateIndex
CREATE INDEX "Product_product_type_idx" ON "Product"("product_type");

-- CreateIndex
CREATE INDEX "Product_published_visible_idx" ON "Product"("published", "visible");

-- CreateIndex
CREATE INDEX "Product_instructor_id_idx" ON "Product"("instructor_id");

-- CreateIndex
CREATE INDEX "Product_category_id_idx" ON "Product"("category_id");

-- CreateIndex
CREATE INDEX "Product_featured_idx" ON "Product"("featured");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_user_id_key" ON "Cart"("user_id");

-- CreateIndex
CREATE INDEX "CartItem_cart_id_idx" ON "CartItem"("cart_id");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cart_id_product_id_key" ON "CartItem"("cart_id", "product_id");

-- CreateIndex
CREATE INDEX "OrderItem_order_id_idx" ON "OrderItem"("order_id");

-- CreateIndex
CREATE INDEX "RefundRequest_user_id_idx" ON "RefundRequest"("user_id");

-- CreateIndex
CREATE INDEX "RefundRequest_status_idx" ON "RefundRequest"("status");

-- CreateIndex
CREATE INDEX "RefundRequest_payment_id_idx" ON "RefundRequest"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "InstructorPayoutProfile_instructor_id_key" ON "InstructorPayoutProfile"("instructor_id");

-- CreateIndex
CREATE INDEX "PayoutWithdrawal_instructor_id_idx" ON "PayoutWithdrawal"("instructor_id");

-- CreateIndex
CREATE INDEX "PayoutWithdrawal_status_idx" ON "PayoutWithdrawal"("status");

-- CreateIndex
CREATE INDEX "ProductBundle_published_idx" ON "ProductBundle"("published");

-- CreateIndex
CREATE INDEX "BundleItem_bundle_id_idx" ON "BundleItem"("bundle_id");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlan_slug_key" ON "MembershipPlan"("slug");

-- CreateIndex
CREATE INDEX "MembershipPlan_active_idx" ON "MembershipPlan"("active");

-- CreateIndex
CREATE INDEX "GiftPurchase_sender_id_idx" ON "GiftPurchase"("sender_id");

-- CreateIndex
CREATE INDEX "GiftPurchase_recipient_email_idx" ON "GiftPurchase"("recipient_email");

-- CreateIndex
CREATE INDEX "GiftPurchase_status_idx" ON "GiftPurchase"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_user_id_key" ON "ReferralCode"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referred_user_id_key" ON "Referral"("referred_user_id");

-- CreateIndex
CREATE INDEX "Referral_referrer_id_idx" ON "Referral"("referrer_id");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_certificate_id_key" ON "Certificate"("certificate_id");

-- CreateIndex
CREATE INDEX "Certificate_user_id_idx" ON "Certificate"("user_id");

-- CreateIndex
CREATE INDEX "Certificate_course_id_idx" ON "Certificate"("course_id");

-- CreateIndex
CREATE INDEX "Certificate_certificate_id_idx" ON "Certificate"("certificate_id");

-- CreateIndex
CREATE INDEX "Certificate_status_idx" ON "Certificate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_user_id_course_id_key" ON "Certificate"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "Section_course_id_idx" ON "Section"("course_id");

-- CreateIndex
CREATE INDEX "Section_course_id_order_idx" ON "Section"("course_id", "order");

-- CreateIndex
CREATE INDEX "Lecture_section_id_idx" ON "Lecture"("section_id");

-- CreateIndex
CREATE INDEX "Lecture_section_id_order_idx" ON "Lecture"("section_id", "order");

-- CreateIndex
CREATE INDEX "Attachment_lecture_id_idx" ON "Attachment"("lecture_id");

-- CreateIndex
CREATE INDEX "LectureMedia_lecture_id_idx" ON "LectureMedia"("lecture_id");

-- CreateIndex
CREATE INDEX "LectureMedia_type_idx" ON "LectureMedia"("type");

-- CreateIndex
CREATE INDEX "Quiz_id_idx" ON "Quiz"("id");

-- CreateIndex
CREATE INDEX "Quiz_author_id_idx" ON "Quiz"("author_id");

-- CreateIndex
CREATE INDEX "Quiz_archived_at_idx" ON "Quiz"("archived_at");

-- CreateIndex
CREATE INDEX "Quiz_visibility_idx" ON "Quiz"("visibility");

-- CreateIndex
CREATE INDEX "QuizVersion_quiz_id_idx" ON "QuizVersion"("quiz_id");

-- CreateIndex
CREATE UNIQUE INDEX "QuizVersion_quiz_id_version_key" ON "QuizVersion"("quiz_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Question_bank_question_id_key" ON "Question"("bank_question_id");

-- CreateIndex
CREATE INDEX "Question_quiz_id_idx" ON "Question"("quiz_id");

-- CreateIndex
CREATE INDEX "Question_quiz_id_order_idx" ON "Question"("quiz_id", "order");

-- CreateIndex
CREATE INDEX "Question_bank_question_id_idx" ON "Question"("bank_question_id");

-- CreateIndex
CREATE INDEX "Option_question_id_idx" ON "Option"("question_id");

-- CreateIndex
CREATE INDEX "QuizAttempt_user_id_idx" ON "QuizAttempt"("user_id");

-- CreateIndex
CREATE INDEX "QuizAttempt_quiz_id_idx" ON "QuizAttempt"("quiz_id");

-- CreateIndex
CREATE INDEX "QuizAttempt_user_id_quiz_id_idx" ON "QuizAttempt"("user_id", "quiz_id");

-- CreateIndex
CREATE INDEX "Enrollment_user_id_idx" ON "Enrollment"("user_id");

-- CreateIndex
CREATE INDEX "Enrollment_course_id_idx" ON "Enrollment"("course_id");

-- CreateIndex
CREATE INDEX "Enrollment_is_completed_idx" ON "Enrollment"("is_completed");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_user_id_course_id_key" ON "Enrollment"("user_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "CourseProgress_enrollment_id_key" ON "CourseProgress"("enrollment_id");

-- CreateIndex
CREATE INDEX "CourseProgress_enrollment_id_idx" ON "CourseProgress"("enrollment_id");

-- CreateIndex
CREATE INDEX "LectureProgress_course_progress_id_idx" ON "LectureProgress"("course_progress_id");

-- CreateIndex
CREATE INDEX "LectureProgress_lecture_id_idx" ON "LectureProgress"("lecture_id");

-- CreateIndex
CREATE UNIQUE INDEX "LectureProgress_course_progress_id_lecture_id_key" ON "LectureProgress"("course_progress_id", "lecture_id");

-- CreateIndex
CREATE INDEX "course_reviews_course_id_idx" ON "course_reviews"("course_id");

-- CreateIndex
CREATE INDEX "course_reviews_student_id_idx" ON "course_reviews"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_reviews_student_id_course_id_key" ON "course_reviews"("student_id", "course_id");

-- CreateIndex
CREATE INDEX "WishlistItem_user_id_idx" ON "WishlistItem"("user_id");

-- CreateIndex
CREATE INDEX "WishlistItem_course_id_idx" ON "WishlistItem"("course_id");

-- CreateIndex
CREATE INDEX "WishlistItem_product_id_idx" ON "WishlistItem"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistItem_user_id_course_id_key" ON "WishlistItem"("user_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistItem_user_id_learning_universe_id_key" ON "WishlistItem"("user_id", "learning_universe_id");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistItem_user_id_product_id_key" ON "WishlistItem"("user_id", "product_id");

-- CreateIndex
CREATE INDEX "StudentNote_user_id_idx" ON "StudentNote"("user_id");

-- CreateIndex
CREATE INDEX "StudentNote_lecture_id_idx" ON "StudentNote"("lecture_id");

-- CreateIndex
CREATE UNIQUE INDEX "StudentNote_user_id_lecture_id_key" ON "StudentNote"("user_id", "lecture_id");

-- CreateIndex
CREATE UNIQUE INDEX "LatexProject_lecture_id_key" ON "LatexProject"("lecture_id");

-- CreateIndex
CREATE INDEX "LatexProject_owner_id_idx" ON "LatexProject"("owner_id");

-- CreateIndex
CREATE INDEX "LatexProjectVersion_project_id_idx" ON "LatexProjectVersion"("project_id");

-- CreateIndex
CREATE INDEX "LatexProjectVersion_project_id_created_at_idx" ON "LatexProjectVersion"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "LatexProjectVersion_project_id_version_number_idx" ON "LatexProjectVersion"("project_id", "version_number");

-- CreateIndex
CREATE INDEX "LatexProjectTimelineEvent_project_id_created_at_idx" ON "LatexProjectTimelineEvent"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "LatexFile_project_id_idx" ON "LatexFile"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "LatexFile_project_id_path_key" ON "LatexFile"("project_id", "path");

-- CreateIndex
CREATE INDEX "LatexCollaborator_project_id_idx" ON "LatexCollaborator"("project_id");

-- CreateIndex
CREATE INDEX "LatexCollaborator_user_id_idx" ON "LatexCollaborator"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "LatexCollaborator_project_id_user_id_key" ON "LatexCollaborator"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "YjsUpdate_doc_name_idx" ON "YjsUpdate"("doc_name");

-- CreateIndex
CREATE INDEX "YjsUpdate_created_at_idx" ON "YjsUpdate"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "YjsSnapshot_doc_name_version_key" ON "YjsSnapshot"("doc_name", "version");

-- CreateIndex
CREATE INDEX "ResourceCourse_instructor_id_idx" ON "ResourceCourse"("instructor_id");

-- CreateIndex
CREATE INDEX "ResourceCourse_created_at_idx" ON "ResourceCourse"("created_at");

-- CreateIndex
CREATE INDEX "ResourceCourse_published_idx" ON "ResourceCourse"("published");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceContent_course_id_key" ON "ResourceContent"("course_id");

-- CreateIndex
CREATE INDEX "ResourceContent_course_id_idx" ON "ResourceContent"("course_id");

-- CreateIndex
CREATE INDEX "ResourceContent_updated_at_idx" ON "ResourceContent"("updated_at");

-- CreateIndex
CREATE INDEX "LearningUniverse_instructor_id_idx" ON "LearningUniverse"("instructor_id");

-- CreateIndex
CREATE INDEX "LearningUniverse_category_id_idx" ON "LearningUniverse"("category_id");

-- CreateIndex
CREATE INDEX "LearningUniverse_status_idx" ON "LearningUniverse"("status");

-- CreateIndex
CREATE INDEX "LearningUniverse_created_at_idx" ON "LearningUniverse"("created_at");

-- CreateIndex
CREATE INDEX "LearningUniverse_source_project_id_idx" ON "LearningUniverse"("source_project_id");

-- CreateIndex
CREATE INDEX "LearningUniversePublishVersion_learning_universe_id_idx" ON "LearningUniversePublishVersion"("learning_universe_id");

-- CreateIndex
CREATE UNIQUE INDEX "LearningUniversePublishVersion_learning_universe_id_version_key" ON "LearningUniversePublishVersion"("learning_universe_id", "version_number");

-- CreateIndex
CREATE INDEX "LearningUniverseAsset_learning_universe_id_idx" ON "LearningUniverseAsset"("learning_universe_id");

-- CreateIndex
CREATE UNIQUE INDEX "LearningUniverseAsset_learning_universe_id_filename_key" ON "LearningUniverseAsset"("learning_universe_id", "filename");

-- CreateIndex
CREATE INDEX "LearningUniverseTrack_learning_universe_id_idx" ON "LearningUniverseTrack"("learning_universe_id");

-- CreateIndex
CREATE INDEX "LearningUniverseTrack_learning_universe_id_order_idx" ON "LearningUniverseTrack"("learning_universe_id", "order");

-- CreateIndex
CREATE INDEX "LearningUniverseModule_track_id_idx" ON "LearningUniverseModule"("track_id");

-- CreateIndex
CREATE INDEX "LearningUniverseModule_track_id_order_idx" ON "LearningUniverseModule"("track_id", "order");

-- CreateIndex
CREATE INDEX "LearningUniverseLesson_module_id_idx" ON "LearningUniverseLesson"("module_id");

-- CreateIndex
CREATE INDEX "LearningUniverseLesson_module_id_order_idx" ON "LearningUniverseLesson"("module_id", "order");

-- CreateIndex
CREATE INDEX "LearningUniverseVideo_lesson_id_idx" ON "LearningUniverseVideo"("lesson_id");

-- CreateIndex
CREATE INDEX "LearningUniverseVideo_lesson_id_order_idx" ON "LearningUniverseVideo"("lesson_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "LearningUniversePractice_lesson_id_key" ON "LearningUniversePractice"("lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "LearningUniverseProject_lesson_id_key" ON "LearningUniverseProject"("lesson_id");

-- CreateIndex
CREATE INDEX "LearningUniverseResource_lesson_id_idx" ON "LearningUniverseResource"("lesson_id");

-- CreateIndex
CREATE INDEX "LearningUniverseResource_lesson_id_order_idx" ON "LearningUniverseResource"("lesson_id", "order");

-- CreateIndex
CREATE INDEX "LearningUniverseEnrollment_user_id_idx" ON "LearningUniverseEnrollment"("user_id");

-- CreateIndex
CREATE INDEX "LearningUniverseEnrollment_learning_universe_id_idx" ON "LearningUniverseEnrollment"("learning_universe_id");

-- CreateIndex
CREATE INDEX "LearningUniverseEnrollment_publish_version_id_idx" ON "LearningUniverseEnrollment"("publish_version_id");

-- CreateIndex
CREATE INDEX "LearningUniverseEnrollment_is_completed_idx" ON "LearningUniverseEnrollment"("is_completed");

-- CreateIndex
CREATE UNIQUE INDEX "LearningUniverseEnrollment_user_id_learning_universe_id_key" ON "LearningUniverseEnrollment"("user_id", "learning_universe_id");

-- CreateIndex
CREATE UNIQUE INDEX "LearningUniverseProgress_enrollment_id_key" ON "LearningUniverseProgress"("enrollment_id");

-- CreateIndex
CREATE INDEX "LearningUniverseProgress_enrollment_id_idx" ON "LearningUniverseProgress"("enrollment_id");

-- CreateIndex
CREATE INDEX "LearningUniverseProgress_publish_version_id_idx" ON "LearningUniverseProgress"("publish_version_id");

-- CreateIndex
CREATE INDEX "LessonProgress_progress_id_idx" ON "LessonProgress"("progress_id");

-- CreateIndex
CREATE INDEX "LessonProgress_lesson_id_idx" ON "LessonProgress"("lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_progress_id_lesson_id_key" ON "LessonProgress"("progress_id", "lesson_id");

-- CreateIndex
CREATE INDEX "LearningUniverseStepProgress_user_id_learning_universe_id_p_idx" ON "LearningUniverseStepProgress"("user_id", "learning_universe_id", "publish_version_id");

-- CreateIndex
CREATE INDEX "LearningUniverseStepProgress_lesson_id_idx" ON "LearningUniverseStepProgress"("lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "LearningUniverseStepProgress_user_id_learning_universe_id_p_key" ON "LearningUniverseStepProgress"("user_id", "learning_universe_id", "publish_version_id", "lesson_id", "step_id");

-- CreateIndex
CREATE UNIQUE INDEX "LearningUniverseCertificate_certificate_id_key" ON "LearningUniverseCertificate"("certificate_id");

-- CreateIndex
CREATE INDEX "LearningUniverseCertificate_user_id_idx" ON "LearningUniverseCertificate"("user_id");

-- CreateIndex
CREATE INDEX "LearningUniverseCertificate_learning_universe_id_idx" ON "LearningUniverseCertificate"("learning_universe_id");

-- CreateIndex
CREATE INDEX "LearningUniverseCertificate_publish_version_id_idx" ON "LearningUniverseCertificate"("publish_version_id");

-- CreateIndex
CREATE INDEX "LearningUniverseCertificate_certificate_id_idx" ON "LearningUniverseCertificate"("certificate_id");

-- CreateIndex
CREATE INDEX "LearningUniverseCertificate_status_idx" ON "LearningUniverseCertificate"("status");

-- CreateIndex
CREATE INDEX "CertificateAuditLog_certificate_public_id_idx" ON "CertificateAuditLog"("certificate_public_id");

-- CreateIndex
CREATE INDEX "CertificateAuditLog_certificate_record_id_idx" ON "CertificateAuditLog"("certificate_record_id");

-- CreateIndex
CREATE INDEX "CertificateAuditLog_user_id_idx" ON "CertificateAuditLog"("user_id");

-- CreateIndex
CREATE INDEX "CertificateAuditLog_action_idx" ON "CertificateAuditLog"("action");

-- CreateIndex
CREATE INDEX "CertificateAuditLog_created_at_idx" ON "CertificateAuditLog"("created_at");

-- CreateIndex
CREATE INDEX "LearningUniverseProjectSubmission_project_id_idx" ON "LearningUniverseProjectSubmission"("project_id");

-- CreateIndex
CREATE INDEX "LearningUniverseProjectSubmission_user_id_idx" ON "LearningUniverseProjectSubmission"("user_id");

-- CreateIndex
CREATE INDEX "LearningUniverseProjectSubmission_status_idx" ON "LearningUniverseProjectSubmission"("status");

-- CreateIndex
CREATE INDEX "LearningUniverseProjectSubmission_reviewed_by_id_idx" ON "LearningUniverseProjectSubmission"("reviewed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "LearningUniverseProjectSubmission_project_id_user_id_key" ON "LearningUniverseProjectSubmission"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "LearningUniverseComponentSubmission_learning_universe_id_idx" ON "LearningUniverseComponentSubmission"("learning_universe_id");

-- CreateIndex
CREATE INDEX "LearningUniverseComponentSubmission_publish_version_id_idx" ON "LearningUniverseComponentSubmission"("publish_version_id");

-- CreateIndex
CREATE INDEX "LearningUniverseComponentSubmission_lesson_id_idx" ON "LearningUniverseComponentSubmission"("lesson_id");

-- CreateIndex
CREATE INDEX "LearningUniverseComponentSubmission_user_id_idx" ON "LearningUniverseComponentSubmission"("user_id");

-- CreateIndex
CREATE INDEX "LearningUniverseComponentSubmission_status_idx" ON "LearningUniverseComponentSubmission"("status");

-- CreateIndex
CREATE INDEX "LearningUniverseComponentSubmission_reviewed_by_id_idx" ON "LearningUniverseComponentSubmission"("reviewed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "LearningUniverseComponentSubmission_learning_universe_id_pu_key" ON "LearningUniverseComponentSubmission"("learning_universe_id", "publish_version_id", "lesson_id", "component_key", "user_id");

-- CreateIndex
CREATE INDEX "UserIntegration_user_id_idx" ON "UserIntegration"("user_id");

-- CreateIndex
CREATE INDEX "UserIntegration_provider_id_idx" ON "UserIntegration"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserIntegration_user_id_provider_id_key" ON "UserIntegration"("user_id", "provider_id");

-- CreateIndex
CREATE INDEX "StudentWorkspaceSnapshot_user_id_idx" ON "StudentWorkspaceSnapshot"("user_id");

-- CreateIndex
CREATE INDEX "StudentWorkspaceSnapshot_learning_universe_id_lesson_id_idx" ON "StudentWorkspaceSnapshot"("learning_universe_id", "lesson_id");

-- CreateIndex
CREATE INDEX "StudentWorkspaceSnapshot_publish_version_id_idx" ON "StudentWorkspaceSnapshot"("publish_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "StudentWorkspaceSnapshot_user_id_learning_universe_id_publi_key" ON "StudentWorkspaceSnapshot"("user_id", "learning_universe_id", "publish_version_id", "lesson_id", "step_id");

-- CreateIndex
CREATE INDEX "StudentWorkspaceVersion_snapshot_id_idx" ON "StudentWorkspaceVersion"("snapshot_id");

-- CreateIndex
CREATE INDEX "StudentWorkspaceVersion_snapshot_id_version_idx" ON "StudentWorkspaceVersion"("snapshot_id", "version");

-- CreateIndex
CREATE INDEX "Notification_user_id_idx" ON "Notification"("user_id");

-- CreateIndex
CREATE INDEX "Notification_user_id_read_idx" ON "Notification"("user_id", "read");

-- CreateIndex
CREATE INDEX "Notification_created_at_idx" ON "Notification"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSession_room_code_key" ON "LiveSession"("room_code");

-- CreateIndex
CREATE INDEX "LiveSession_room_code_idx" ON "LiveSession"("room_code");

-- CreateIndex
CREATE INDEX "LiveSession_host_user_id_idx" ON "LiveSession"("host_user_id");

-- CreateIndex
CREATE INDEX "LiveSession_quiz_id_idx" ON "LiveSession"("quiz_id");

-- CreateIndex
CREATE INDEX "LiveSession_status_idx" ON "LiveSession"("status");

-- CreateIndex
CREATE INDEX "LiveSession_course_id_idx" ON "LiveSession"("course_id");

-- CreateIndex
CREATE INDEX "LiveParticipant_session_id_idx" ON "LiveParticipant"("session_id");

-- CreateIndex
CREATE INDEX "LiveParticipant_user_id_idx" ON "LiveParticipant"("user_id");

-- CreateIndex
CREATE INDEX "LiveParticipant_session_id_score_idx" ON "LiveParticipant"("session_id", "score");

-- CreateIndex
CREATE UNIQUE INDEX "LiveParticipant_session_id_user_id_key" ON "LiveParticipant"("session_id", "user_id");

-- CreateIndex
CREATE INDEX "LiveAnswer_session_id_idx" ON "LiveAnswer"("session_id");

-- CreateIndex
CREATE INDEX "LiveAnswer_question_id_idx" ON "LiveAnswer"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "LiveAnswer_session_id_participant_id_question_id_key" ON "LiveAnswer"("session_id", "participant_id", "question_id");

-- CreateIndex
CREATE INDEX "LeaderboardSnapshot_session_id_idx" ON "LeaderboardSnapshot"("session_id");

-- CreateIndex
CREATE INDEX "LeaderboardSnapshot_session_id_question_index_idx" ON "LeaderboardSnapshot"("session_id", "question_index");

-- CreateIndex
CREATE UNIQUE INDEX "SessionAnalytics_session_id_key" ON "SessionAnalytics"("session_id");

-- CreateIndex
CREATE INDEX "QuizRoomTemplate_host_user_id_idx" ON "QuizRoomTemplate"("host_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_library_templates_slug_key" ON "quiz_library_templates"("slug");

-- CreateIndex
CREATE INDEX "quiz_library_templates_category_idx" ON "quiz_library_templates"("category");

-- CreateIndex
CREATE INDEX "quiz_library_templates_source_idx" ON "quiz_library_templates"("source");

-- CreateIndex
CREATE INDEX "quiz_library_templates_is_featured_idx" ON "quiz_library_templates"("is_featured");

-- CreateIndex
CREATE INDEX "quiz_library_templates_is_official_idx" ON "quiz_library_templates"("is_official");

-- CreateIndex
CREATE INDEX "quiz_library_templates_author_user_id_idx" ON "quiz_library_templates"("author_user_id");

-- CreateIndex
CREATE INDEX "quiz_library_templates_status_idx" ON "quiz_library_templates"("status");

-- CreateIndex
CREATE INDEX "quiz_library_template_usages_user_id_used_at_idx" ON "quiz_library_template_usages"("user_id", "used_at");

-- CreateIndex
CREATE INDEX "quiz_library_template_usages_template_id_idx" ON "quiz_library_template_usages"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_library_template_versions_template_id_version_key" ON "quiz_library_template_versions"("template_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "QuizRoomPreferences_user_id_key" ON "QuizRoomPreferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "BankQuestion_legacy_question_id_key" ON "BankQuestion"("legacy_question_id");

-- CreateIndex
CREATE INDEX "BankQuestion_author_id_idx" ON "BankQuestion"("author_id");

-- CreateIndex
CREATE INDEX "BankQuestion_status_idx" ON "BankQuestion"("status");

-- CreateIndex
CREATE INDEX "BankQuestion_type_idx" ON "BankQuestion"("type");

-- CreateIndex
CREATE INDEX "BankQuestion_difficulty_idx" ON "BankQuestion"("difficulty");

-- CreateIndex
CREATE INDEX "BankQuestion_bloom_level_idx" ON "BankQuestion"("bloom_level");

-- CreateIndex
CREATE INDEX "BankQuestion_course_id_idx" ON "BankQuestion"("course_id");

-- CreateIndex
CREATE INDEX "BankQuestion_source_idx" ON "BankQuestion"("source");

-- CreateIndex
CREATE INDEX "BankQuestion_created_at_idx" ON "BankQuestion"("created_at");

-- CreateIndex
CREATE INDEX "BankQuestionOption_question_id_idx" ON "BankQuestionOption"("question_id");

-- CreateIndex
CREATE INDEX "BankQuestionVersion_question_id_idx" ON "BankQuestionVersion"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "BankQuestionVersion_question_id_version_key" ON "BankQuestionVersion"("question_id", "version");

-- CreateIndex
CREATE INDEX "BankQuestionCollection_author_id_idx" ON "BankQuestionCollection"("author_id");

-- CreateIndex
CREATE INDEX "BankQuestionCollection_kind_idx" ON "BankQuestionCollection"("kind");

-- CreateIndex
CREATE INDEX "BankQuestionCollection_visibility_idx" ON "BankQuestionCollection"("visibility");

-- CreateIndex
CREATE INDEX "BankQuestionCollectionItem_collection_id_idx" ON "BankQuestionCollectionItem"("collection_id");

-- CreateIndex
CREATE INDEX "BankQuestionCollectionItem_question_id_idx" ON "BankQuestionCollectionItem"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "BankQuestionCollectionItem_collection_id_question_id_key" ON "BankQuestionCollectionItem"("collection_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "BankQuestionAnalytics_question_id_key" ON "BankQuestionAnalytics"("question_id");

-- CreateIndex
CREATE INDEX "BankQuestionReview_question_id_idx" ON "BankQuestionReview"("question_id");

-- CreateIndex
CREATE INDEX "BankQuestionReview_status_idx" ON "BankQuestionReview"("status");

-- CreateIndex
CREATE INDEX "BankQuestionAIValidation_question_id_idx" ON "BankQuestionAIValidation"("question_id");

-- CreateIndex
CREATE INDEX "BankQuestionAIValidation_status_idx" ON "BankQuestionAIValidation"("status");

-- CreateIndex
CREATE INDEX "BankQuestionImportJob_author_id_idx" ON "BankQuestionImportJob"("author_id");

-- CreateIndex
CREATE INDEX "BankQuestionImportJob_status_idx" ON "BankQuestionImportJob"("status");

-- CreateIndex
CREATE INDEX "BankQuestionImportJob_source_idx" ON "BankQuestionImportJob"("source");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Department_organization_id_idx" ON "Department"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "Department_organization_id_code_key" ON "Department"("organization_id", "code");

-- CreateIndex
CREATE INDEX "OrganizationMember_user_id_idx" ON "OrganizationMember"("user_id");

-- CreateIndex
CREATE INDEX "OrganizationMember_department_id_idx" ON "OrganizationMember"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organization_id_user_id_key" ON "OrganizationMember"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "TenantConfig_organization_id_key" ON "TenantConfig"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_published_version_id_key" ON "Assessment"("published_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_legacy_quiz_id_key" ON "Assessment"("legacy_quiz_id");

-- CreateIndex
CREATE INDEX "Assessment_author_id_idx" ON "Assessment"("author_id");

-- CreateIndex
CREATE INDEX "Assessment_organization_id_idx" ON "Assessment"("organization_id");

-- CreateIndex
CREATE INDEX "Assessment_lifecycle_idx" ON "Assessment"("lifecycle");

-- CreateIndex
CREATE INDEX "Assessment_kind_idx" ON "Assessment"("kind");

-- CreateIndex
CREATE INDEX "Assessment_legacy_quiz_id_idx" ON "Assessment"("legacy_quiz_id");

-- CreateIndex
CREATE INDEX "AssessmentVersion_assessment_id_idx" ON "AssessmentVersion"("assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentVersion_assessment_id_version_key" ON "AssessmentVersion"("assessment_id", "version");

-- CreateIndex
CREATE INDEX "AssessmentSection_assessment_id_order_idx" ON "AssessmentSection"("assessment_id", "order");

-- CreateIndex
CREATE INDEX "AssessmentItem_section_id_order_idx" ON "AssessmentItem"("section_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentItem_section_id_question_id_key" ON "AssessmentItem"("section_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessQuestionType_slug_key" ON "AssessQuestionType"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AssessQuestion_legacy_bank_id_key" ON "AssessQuestion"("legacy_bank_id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessQuestion_legacy_quiz_q_id_key" ON "AssessQuestion"("legacy_quiz_q_id");

-- CreateIndex
CREATE INDEX "AssessQuestion_author_id_idx" ON "AssessQuestion"("author_id");

-- CreateIndex
CREATE INDEX "AssessQuestion_type_id_idx" ON "AssessQuestion"("type_id");

-- CreateIndex
CREATE INDEX "AssessQuestion_organization_id_idx" ON "AssessQuestion"("organization_id");

-- CreateIndex
CREATE INDEX "AssessQuestion_department_id_idx" ON "AssessQuestion"("department_id");

-- CreateIndex
CREATE INDEX "AssessQuestion_subject_idx" ON "AssessQuestion"("subject");

-- CreateIndex
CREATE INDEX "AssessQuestion_topic_idx" ON "AssessQuestion"("topic");

-- CreateIndex
CREATE INDEX "AssessQuestion_difficulty_idx" ON "AssessQuestion"("difficulty");

-- CreateIndex
CREATE INDEX "AssessQuestion_bloom_level_idx" ON "AssessQuestion"("bloom_level");

-- CreateIndex
CREATE INDEX "AssessQuestion_visibility_idx" ON "AssessQuestion"("visibility");

-- CreateIndex
CREATE INDEX "AssessQuestion_status_idx" ON "AssessQuestion"("status");

-- CreateIndex
CREATE INDEX "AssessQuestion_legacy_bank_id_idx" ON "AssessQuestion"("legacy_bank_id");

-- CreateIndex
CREATE INDEX "AssessQuestion_legacy_quiz_q_id_idx" ON "AssessQuestion"("legacy_quiz_q_id");

-- CreateIndex
CREATE INDEX "AssessQuestionVersion_question_id_idx" ON "AssessQuestionVersion"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessQuestionVersion_question_id_version_key" ON "AssessQuestionVersion"("question_id", "version");

-- CreateIndex
CREATE INDEX "AssessChoice_question_id_order_idx" ON "AssessChoice"("question_id", "order");

-- CreateIndex
CREATE INDEX "MediaAsset_uploader_id_idx" ON "MediaAsset"("uploader_id");

-- CreateIndex
CREATE INDEX "MediaAsset_organization_id_idx" ON "MediaAsset"("organization_id");

-- CreateIndex
CREATE INDEX "MediaVariant_asset_id_idx" ON "MediaVariant"("asset_id");

-- CreateIndex
CREATE INDEX "MediaUsage_entity_type_entity_id_idx" ON "MediaUsage"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "MediaUsage_question_id_idx" ON "MediaUsage"("question_id");

-- CreateIndex
CREATE INDEX "MediaUsage_question_version_id_idx" ON "MediaUsage"("question_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentDeployment_legacy_session_id_key" ON "AssessmentDeployment"("legacy_session_id");

-- CreateIndex
CREATE INDEX "AssessmentDeployment_assessment_id_idx" ON "AssessmentDeployment"("assessment_id");

-- CreateIndex
CREATE INDEX "AssessmentDeployment_mode_idx" ON "AssessmentDeployment"("mode");

-- CreateIndex
CREATE INDEX "AssessmentDeployment_status_idx" ON "AssessmentDeployment"("status");

-- CreateIndex
CREATE INDEX "AssessmentDeployment_context_type_context_id_idx" ON "AssessmentDeployment"("context_type", "context_id");

-- CreateIndex
CREATE INDEX "AssessmentDeployment_host_id_idx" ON "AssessmentDeployment"("host_id");

-- CreateIndex
CREATE INDEX "AssessmentDeployment_legacy_session_id_idx" ON "AssessmentDeployment"("legacy_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttempt_reconnect_token_key" ON "AssessmentAttempt"("reconnect_token");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_deployment_id_idx" ON "AssessmentAttempt"("deployment_id");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_user_id_idx" ON "AssessmentAttempt"("user_id");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_user_id_deployment_id_idx" ON "AssessmentAttempt"("user_id", "deployment_id");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_status_idx" ON "AssessmentAttempt"("status");

-- CreateIndex
CREATE INDEX "AssessmentAttemptQuestion_attempt_id_order_idx" ON "AssessmentAttemptQuestion"("attempt_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttemptQuestion_attempt_id_question_id_key" ON "AssessmentAttemptQuestion"("attempt_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentResponse_attempt_question_id_key" ON "AssessmentResponse"("attempt_question_id");

-- CreateIndex
CREATE INDEX "AssessmentResponse_question_id_idx" ON "AssessmentResponse"("question_id");

-- CreateIndex
CREATE INDEX "AssessmentResponse_participant_id_idx" ON "AssessmentResponse"("participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "LearningRecord_attempt_id_key" ON "LearningRecord"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementRecord_attempt_id_key" ON "EngagementRecord"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessLiveRoom_deployment_id_key" ON "AssessLiveRoom"("deployment_id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessLiveRoom_room_code_key" ON "AssessLiveRoom"("room_code");

-- CreateIndex
CREATE UNIQUE INDEX "AssessParticipant_attempt_id_key" ON "AssessParticipant"("attempt_id");

-- CreateIndex
CREATE INDEX "AssessParticipant_room_id_engagement_score_idx" ON "AssessParticipant"("room_id", "engagement_score");

-- CreateIndex
CREATE UNIQUE INDEX "AssessParticipant_room_id_user_id_key" ON "AssessParticipant"("room_id", "user_id");

-- CreateIndex
CREATE INDEX "AssessLeaderboardSnapshot_room_id_question_index_idx" ON "AssessLeaderboardSnapshot"("room_id", "question_index");

-- CreateIndex
CREATE UNIQUE INDEX "AssessLiveRoomAnalytics_room_id_key" ON "AssessLiveRoomAnalytics"("room_id");

-- CreateIndex
CREATE UNIQUE INDEX "HomeworkAssignment_deployment_id_key" ON "HomeworkAssignment"("deployment_id");

-- CreateIndex
CREATE UNIQUE INDEX "CourseAssignment_deployment_id_key" ON "CourseAssignment"("deployment_id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessQuestionAnalytics_question_id_key" ON "AssessQuestionAnalytics"("question_id");

-- CreateIndex
CREATE INDEX "AssessQuestionRelation_parent_question_id_idx" ON "AssessQuestionRelation"("parent_question_id");

-- CreateIndex
CREATE INDEX "AssessQuestionRelation_child_question_id_idx" ON "AssessQuestionRelation"("child_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessQuestionRelation_parent_question_id_child_question_id_key" ON "AssessQuestionRelation"("parent_question_id", "child_question_id", "relation_type");

-- CreateIndex
CREATE INDEX "AssessQuestionCollection_author_id_idx" ON "AssessQuestionCollection"("author_id");

-- CreateIndex
CREATE INDEX "AssessQuestionCollection_organization_id_idx" ON "AssessQuestionCollection"("organization_id");

-- CreateIndex
CREATE INDEX "AssessQuestionCollection_kind_idx" ON "AssessQuestionCollection"("kind");

-- CreateIndex
CREATE INDEX "AssessQuestionCollection_visibility_idx" ON "AssessQuestionCollection"("visibility");

-- CreateIndex
CREATE INDEX "AssessQuestionCollectionItem_collection_id_idx" ON "AssessQuestionCollectionItem"("collection_id");

-- CreateIndex
CREATE INDEX "AssessQuestionCollectionItem_question_id_idx" ON "AssessQuestionCollectionItem"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "AssessQuestionCollectionItem_collection_id_question_id_key" ON "AssessQuestionCollectionItem"("collection_id", "question_id");

-- CreateIndex
CREATE INDEX "XPTransaction_user_id_created_at_idx" ON "XPTransaction"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "CoinTransaction_user_id_created_at_idx" ON "CoinTransaction"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeDefinition_slug_key" ON "BadgeDefinition"("slug");

-- CreateIndex
CREATE INDEX "BadgeAward_user_id_earned_at_idx" ON "BadgeAward"("user_id", "earned_at");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementDefinition_slug_key" ON "AchievementDefinition"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_user_id_definition_id_key" ON "Achievement"("user_id", "definition_id");

-- CreateIndex
CREATE INDEX "PlatformAnalyticsEvent_event_type_created_at_idx" ON "PlatformAnalyticsEvent"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "PlatformAnalyticsEvent_organization_id_created_at_idx" ON "PlatformAnalyticsEvent"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "PlatformAnalyticsEvent_assessment_id_idx" ON "PlatformAnalyticsEvent"("assessment_id");

-- CreateIndex
CREATE INDEX "PlatformAnalyticsEvent_actor_id_created_at_idx" ON "PlatformAnalyticsEvent"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "AIHistory_user_id_created_at_idx" ON "AIHistory"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "AIHistory_feature_created_at_idx" ON "AIHistory"("feature", "created_at");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_entity_type_entity_id_idx" ON "PlatformAuditLog"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_actor_id_created_at_idx" ON "PlatformAuditLog"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_organization_id_created_at_idx" ON "PlatformAuditLog"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginHistory" ADD CONSTRAINT "LoginHistory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LatexDocument" ADD CONSTRAINT "LatexDocument_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_learning_universe_id_fkey" FOREIGN KEY ("learning_universe_id") REFERENCES "LearningUniverse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_learning_universe_id_fkey" FOREIGN KEY ("learning_universe_id") REFERENCES "LearningUniverse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_learning_universe_id_fkey" FOREIGN KEY ("learning_universe_id") REFERENCES "LearningUniverse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "ProductBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorPayoutProfile" ADD CONSTRAINT "InstructorPayoutProfile_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutWithdrawal" ADD CONSTRAINT "PayoutWithdrawal_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "ProductBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftPurchase" ADD CONSTRAINT "GiftPurchase_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftPurchase" ADD CONSTRAINT "GiftPurchase_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referral_code_id_fkey" FOREIGN KEY ("referral_code_id") REFERENCES "ReferralCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referred_user_id_fkey" FOREIGN KEY ("referred_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lecture" ADD CONSTRAINT "Lecture_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "Quiz"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lecture" ADD CONSTRAINT "Lecture_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_lecture_id_fkey" FOREIGN KEY ("lecture_id") REFERENCES "Lecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LectureMedia" ADD CONSTRAINT "LectureMedia_lecture_id_fkey" FOREIGN KEY ("lecture_id") REFERENCES "Lecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizVersion" ADD CONSTRAINT "QuizVersion_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_bank_question_id_fkey" FOREIGN KEY ("bank_question_id") REFERENCES "BankQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Option" ADD CONSTRAINT "Option_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseProgress" ADD CONSTRAINT "CourseProgress_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LectureProgress" ADD CONSTRAINT "LectureProgress_course_progress_id_fkey" FOREIGN KEY ("course_progress_id") REFERENCES "CourseProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LectureProgress" ADD CONSTRAINT "LectureProgress_lecture_id_fkey" FOREIGN KEY ("lecture_id") REFERENCES "Lecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_learning_universe_id_fkey" FOREIGN KEY ("learning_universe_id") REFERENCES "LearningUniverse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentNote" ADD CONSTRAINT "StudentNote_lecture_id_fkey" FOREIGN KEY ("lecture_id") REFERENCES "Lecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentNote" ADD CONSTRAINT "StudentNote_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LatexProject" ADD CONSTRAINT "LatexProject_lecture_id_fkey" FOREIGN KEY ("lecture_id") REFERENCES "Lecture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LatexProject" ADD CONSTRAINT "LatexProject_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LatexProjectVersion" ADD CONSTRAINT "LatexProjectVersion_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "LatexProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LatexProjectVersion" ADD CONSTRAINT "LatexProjectVersion_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LatexProjectTimelineEvent" ADD CONSTRAINT "LatexProjectTimelineEvent_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "LatexProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LatexProjectTimelineEvent" ADD CONSTRAINT "LatexProjectTimelineEvent_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LatexFile" ADD CONSTRAINT "LatexFile_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "LatexProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LatexCollaborator" ADD CONSTRAINT "LatexCollaborator_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "LatexProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LatexCollaborator" ADD CONSTRAINT "LatexCollaborator_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceCourse" ADD CONSTRAINT "ResourceCourse_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceContent" ADD CONSTRAINT "ResourceContent_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "ResourceCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverse" ADD CONSTRAINT "LearningUniverse_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverse" ADD CONSTRAINT "LearningUniverse_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverse" ADD CONSTRAINT "LearningUniverse_source_project_id_fkey" FOREIGN KEY ("source_project_id") REFERENCES "LatexProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverse" ADD CONSTRAINT "LearningUniverse_current_publish_version_id_fkey" FOREIGN KEY ("current_publish_version_id") REFERENCES "LearningUniversePublishVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniversePublishVersion" ADD CONSTRAINT "LearningUniversePublishVersion_learning_universe_id_fkey" FOREIGN KEY ("learning_universe_id") REFERENCES "LearningUniverse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseAsset" ADD CONSTRAINT "LearningUniverseAsset_learning_universe_id_fkey" FOREIGN KEY ("learning_universe_id") REFERENCES "LearningUniverse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseTrack" ADD CONSTRAINT "LearningUniverseTrack_learning_universe_id_fkey" FOREIGN KEY ("learning_universe_id") REFERENCES "LearningUniverse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseModule" ADD CONSTRAINT "LearningUniverseModule_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "LearningUniverseTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseLesson" ADD CONSTRAINT "LearningUniverseLesson_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "LearningUniverseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseLesson" ADD CONSTRAINT "LearningUniverseLesson_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "Quiz"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseVideo" ADD CONSTRAINT "LearningUniverseVideo_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "LearningUniverseLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniversePractice" ADD CONSTRAINT "LearningUniversePractice_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "LearningUniverseLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseProject" ADD CONSTRAINT "LearningUniverseProject_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "LearningUniverseLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseResource" ADD CONSTRAINT "LearningUniverseResource_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "LearningUniverseLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseEnrollment" ADD CONSTRAINT "LearningUniverseEnrollment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseEnrollment" ADD CONSTRAINT "LearningUniverseEnrollment_learning_universe_id_fkey" FOREIGN KEY ("learning_universe_id") REFERENCES "LearningUniverse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseEnrollment" ADD CONSTRAINT "LearningUniverseEnrollment_publish_version_id_fkey" FOREIGN KEY ("publish_version_id") REFERENCES "LearningUniversePublishVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseProgress" ADD CONSTRAINT "LearningUniverseProgress_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "LearningUniverseEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_progress_id_fkey" FOREIGN KEY ("progress_id") REFERENCES "LearningUniverseProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "LearningUniverseLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseStepProgress" ADD CONSTRAINT "LearningUniverseStepProgress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseStepProgress" ADD CONSTRAINT "LearningUniverseStepProgress_learning_universe_id_fkey" FOREIGN KEY ("learning_universe_id") REFERENCES "LearningUniverse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseCertificate" ADD CONSTRAINT "LearningUniverseCertificate_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseCertificate" ADD CONSTRAINT "LearningUniverseCertificate_learning_universe_id_fkey" FOREIGN KEY ("learning_universe_id") REFERENCES "LearningUniverse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseProjectSubmission" ADD CONSTRAINT "LearningUniverseProjectSubmission_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "LearningUniverseProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseProjectSubmission" ADD CONSTRAINT "LearningUniverseProjectSubmission_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseProjectSubmission" ADD CONSTRAINT "LearningUniverseProjectSubmission_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseComponentSubmission" ADD CONSTRAINT "LearningUniverseComponentSubmission_learning_universe_id_fkey" FOREIGN KEY ("learning_universe_id") REFERENCES "LearningUniverse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseComponentSubmission" ADD CONSTRAINT "LearningUniverseComponentSubmission_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "LearningUniverseLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseComponentSubmission" ADD CONSTRAINT "LearningUniverseComponentSubmission_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningUniverseComponentSubmission" ADD CONSTRAINT "LearningUniverseComponentSubmission_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIntegration" ADD CONSTRAINT "UserIntegration_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentWorkspaceSnapshot" ADD CONSTRAINT "StudentWorkspaceSnapshot_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentWorkspaceVersion" ADD CONSTRAINT "StudentWorkspaceVersion_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "StudentWorkspaceSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveParticipant" ADD CONSTRAINT "LiveParticipant_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveParticipant" ADD CONSTRAINT "LiveParticipant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAnswer" ADD CONSTRAINT "LiveAnswer_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAnswer" ADD CONSTRAINT "LiveAnswer_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "LiveParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAnswer" ADD CONSTRAINT "LiveAnswer_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardSnapshot" ADD CONSTRAINT "LeaderboardSnapshot_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAnalytics" ADD CONSTRAINT "SessionAnalytics_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizRoomTemplate" ADD CONSTRAINT "QuizRoomTemplate_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_library_templates" ADD CONSTRAINT "quiz_library_templates_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_library_template_favorites" ADD CONSTRAINT "quiz_library_template_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_library_template_favorites" ADD CONSTRAINT "quiz_library_template_favorites_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "quiz_library_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_library_template_usages" ADD CONSTRAINT "quiz_library_template_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_library_template_usages" ADD CONSTRAINT "quiz_library_template_usages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "quiz_library_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_library_template_versions" ADD CONSTRAINT "quiz_library_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "quiz_library_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizRoomPreferences" ADD CONSTRAINT "QuizRoomPreferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankQuestion" ADD CONSTRAINT "BankQuestion_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankQuestion" ADD CONSTRAINT "BankQuestion_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankQuestion" ADD CONSTRAINT "BankQuestion_legacy_question_id_fkey" FOREIGN KEY ("legacy_question_id") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankQuestionOption" ADD CONSTRAINT "BankQuestionOption_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "BankQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankQuestionVersion" ADD CONSTRAINT "BankQuestionVersion_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "BankQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankQuestionCollection" ADD CONSTRAINT "BankQuestionCollection_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankQuestionCollectionItem" ADD CONSTRAINT "BankQuestionCollectionItem_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "BankQuestionCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankQuestionCollectionItem" ADD CONSTRAINT "BankQuestionCollectionItem_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "BankQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankQuestionAnalytics" ADD CONSTRAINT "BankQuestionAnalytics_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "BankQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankQuestionReview" ADD CONSTRAINT "BankQuestionReview_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "BankQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankQuestionReview" ADD CONSTRAINT "BankQuestionReview_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankQuestionAIValidation" ADD CONSTRAINT "BankQuestionAIValidation_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "BankQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankQuestionImportJob" ADD CONSTRAINT "BankQuestionImportJob_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantConfig" ADD CONSTRAINT "TenantConfig_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_published_version_id_fkey" FOREIGN KEY ("published_version_id") REFERENCES "AssessmentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSection" ADD CONSTRAINT "AssessmentSection_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "AssessmentSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "AssessQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessQuestion" ADD CONSTRAINT "AssessQuestion_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessQuestion" ADD CONSTRAINT "AssessQuestion_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessQuestion" ADD CONSTRAINT "AssessQuestion_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "AssessQuestionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessQuestion" ADD CONSTRAINT "AssessQuestion_forked_from_id_fkey" FOREIGN KEY ("forked_from_id") REFERENCES "AssessQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessQuestionVersion" ADD CONSTRAINT "AssessQuestionVersion_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "AssessQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessQuestionVersion" ADD CONSTRAINT "AssessQuestionVersion_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessChoice" ADD CONSTRAINT "AssessChoice_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "AssessQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaVariant" ADD CONSTRAINT "MediaVariant_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaUsage" ADD CONSTRAINT "MediaUsage_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaUsage" ADD CONSTRAINT "MediaUsage_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "AssessQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaUsage" ADD CONSTRAINT "MediaUsage_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "AssessQuestionVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentDeployment" ADD CONSTRAINT "AssessmentDeployment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentDeployment" ADD CONSTRAINT "AssessmentDeployment_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentDeployment" ADD CONSTRAINT "AssessmentDeployment_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "AssessmentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentDeployment" ADD CONSTRAINT "AssessmentDeployment_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "AssessmentDeployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_assessment_version_id_fkey" FOREIGN KEY ("assessment_version_id") REFERENCES "AssessmentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttemptQuestion" ADD CONSTRAINT "AssessmentAttemptQuestion_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttemptQuestion" ADD CONSTRAINT "AssessmentAttemptQuestion_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "AssessQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttemptQuestion" ADD CONSTRAINT "AssessmentAttemptQuestion_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "AssessQuestionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResponse" ADD CONSTRAINT "AssessmentResponse_attempt_question_id_fkey" FOREIGN KEY ("attempt_question_id") REFERENCES "AssessmentAttemptQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResponse" ADD CONSTRAINT "AssessmentResponse_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "AssessQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResponse" ADD CONSTRAINT "AssessmentResponse_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "AssessQuestionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResponse" ADD CONSTRAINT "AssessmentResponse_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "AssessParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRecord" ADD CONSTRAINT "LearningRecord_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementRecord" ADD CONSTRAINT "EngagementRecord_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessLiveRoom" ADD CONSTRAINT "AssessLiveRoom_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "AssessmentDeployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessParticipant" ADD CONSTRAINT "AssessParticipant_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "AssessLiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessParticipant" ADD CONSTRAINT "AssessParticipant_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "AssessmentAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessParticipant" ADD CONSTRAINT "AssessParticipant_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "AssessTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessLeaderboardSnapshot" ADD CONSTRAINT "AssessLeaderboardSnapshot_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "AssessLiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessLiveRoomAnalytics" ADD CONSTRAINT "AssessLiveRoomAnalytics_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "AssessLiveRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkAssignment" ADD CONSTRAINT "HomeworkAssignment_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "AssessmentDeployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "AssessmentDeployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessQuestionAnalytics" ADD CONSTRAINT "AssessQuestionAnalytics_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "AssessQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessQuestionRelation" ADD CONSTRAINT "AssessQuestionRelation_parent_question_id_fkey" FOREIGN KEY ("parent_question_id") REFERENCES "AssessQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessQuestionRelation" ADD CONSTRAINT "AssessQuestionRelation_child_question_id_fkey" FOREIGN KEY ("child_question_id") REFERENCES "AssessQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessQuestionCollection" ADD CONSTRAINT "AssessQuestionCollection_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessQuestionCollection" ADD CONSTRAINT "AssessQuestionCollection_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessQuestionCollectionItem" ADD CONSTRAINT "AssessQuestionCollectionItem_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "AssessQuestionCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessQuestionCollectionItem" ADD CONSTRAINT "AssessQuestionCollectionItem_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "AssessQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGamificationProfile" ADD CONSTRAINT "UserGamificationProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XPTransaction" ADD CONSTRAINT "XPTransaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinTransaction" ADD CONSTRAINT "CoinTransaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "BadgeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "AchievementDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAnalyticsEvent" ADD CONSTRAINT "PlatformAnalyticsEvent_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIHistory" ADD CONSTRAINT "AIHistory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAuditLog" ADD CONSTRAINT "PlatformAuditLog_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

