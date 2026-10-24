-- IF NOT EXISTS: the shared database already has this value from SEN-49's earlier 0016, since replaced by this one.
ALTER TYPE "public"."generation_job_status" ADD VALUE IF NOT EXISTS 'needs_new_blueprint' BEFORE 'succeeded';
