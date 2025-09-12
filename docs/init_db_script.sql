-- ================================================================
-- Zhuzhen DB - Initialization (ENUM-aligned, safe for existing schema)
-- ================================================================

BEGIN;

-- ------------------------------------------------
-- (A) Optional: cleanup existing seed data by keys
-- ------------------------------------------------
-- Users (by openid)
DELETE FROM users
WHERE openid IN ('wx_student_001','wx_student_002','wx_student_003',
                 'wx_teacher_001','wx_teacher_002');

-- Tags (by name)
DELETE FROM task_tag_usages WHERE tag_id IN (
  SELECT id FROM task_tags WHERE name IN ('xingce','shenlun','mianshi','yuyan','shuliang','panduan')
);
DELETE FROM task_tags WHERE name IN ('xingce','shenlun','mianshi','yuyan','shuliang','panduan');

-- Materials (by title)
DELETE FROM material_likes      WHERE material_id IN (SELECT id FROM materials WHERE title IN ('行测高频词汇手册','申论写作技巧视频教程','2025年时政热点汇总','面试真题解析音频'));
DELETE FROM material_views      WHERE material_id IN (SELECT id FROM materials WHERE title IN ('行测高频词汇手册','申论写作技巧视频教程','2025年时政热点汇总','面试真题解析音频'));
DELETE FROM material_collections WHERE material_id IN (SELECT id FROM materials WHERE title IN ('行测高频词汇手册','申论写作技巧视频教程','2025年时政热点汇总','面试真题解析音频'));
DELETE FROM materials WHERE title IN ('行测高频词汇手册','申论写作技巧视频教程','2025年时政热点汇总','面试真题解析音频');

-- Tasks (by title) and their dependencies
DELETE FROM submissions WHERE task_id IN (
  SELECT id FROM tasks WHERE title IN ('行测言语理解综合练习','申论热点分析写作','数量关系突破训练','面试模拟实战练习','逻辑判断专项突破')
);
DELETE FROM task_tag_usages WHERE task_id IN (
  SELECT id FROM tasks WHERE title IN ('行测言语理解综合练习','申论热点分析写作','数量关系突破训练','面试模拟实战练习','逻辑判断专项突破')
);
DELETE FROM tasks WHERE title IN ('行测言语理解综合练习','申论热点分析写作','数量关系突破训练','面试模拟实战练习','逻辑判断专项突破');

-- Notifications & settings & reviews related to seed users
DELETE FROM notifications         WHERE user_id IN (SELECT id FROM users WHERE openid IN ('wx_student_001','wx_student_002','wx_student_003'));
DELETE FROM notification_settings WHERE user_id IN (SELECT id FROM users WHERE openid IN ('wx_student_001','wx_student_002','wx_student_003'));

DELETE FROM user_reviews WHERE user_id IN (SELECT id FROM users WHERE openid IN ('wx_student_001','wx_student_002','wx_student_003'));
DELETE FROM review_settings WHERE user_id IN (SELECT id FROM users WHERE openid IN ('wx_student_001','wx_student_002','wx_student_003'));

DELETE FROM user_score_records WHERE user_id IN (SELECT id FROM users WHERE openid IN ('wx_student_001','wx_student_002'));
DELETE FROM user_checkins     WHERE user_id IN (SELECT id FROM users WHERE openid IN ('wx_student_001','wx_student_002'));

-- ------------------------------------------------
-- (1) USERS (3 students + 2 teachers)
-- ------------------------------------------------
INSERT INTO users (
  openid, unionid, nickname, avatar, phone, role,
  current_streak, best_streak, total_score, monthly_score, quarterly_score,
  last_checkin_date, total_submissions,
  subscription_type, subscription_expires_at, trial_started_at, is_active,
  created_at, updated_at
) VALUES
-- Students
('wx_student_001','union_001','张小明','https://example.com/avatar1.jpg','13800138001','STUDENT',
 5,10,150,45,80, CURRENT_DATE, 8,
 'PREMIUM', NULL, NULL, TRUE, NOW(), NOW()),

('wx_student_002','union_002','李小红','https://example.com/avatar2.jpg','13800138002','STUDENT',
 3,7,95,25,60, CURRENT_DATE - INTERVAL '1 day', 5,
 'TRIAL', NULL, NOW() - INTERVAL '5 days', TRUE, NOW(), NOW()),

('wx_student_003',NULL,'王小华',NULL,NULL,'STUDENT',
 0,0,0,0,0, NULL, 0,
 'TRIAL', NULL, NOW() - INTERVAL '2 days', TRUE, NOW(), NOW()),

-- Teachers
('wx_teacher_001','union_teacher_001','陈老师','https://example.com/teacher1.jpg','13900139001','TEACHER',
 0,0,0,0,0, NULL, 0,
 'PREMIUM', NULL, NULL, TRUE, NOW(), NOW()),

('wx_teacher_002','union_teacher_002','刘老师','https://example.com/teacher2.jpg','13900139002','TEACHER',
 0,0,0,0,0, NULL, 0,
 'PREMIUM', NULL, NULL, TRUE, NOW(), NOW());

-- 便捷 CTE：抓取我们刚插入的用户 id
WITH u AS (
  SELECT
    MAX(CASE WHEN openid='wx_teacher_001' THEN id END) AS t1_id,
    MAX(CASE WHEN openid='wx_teacher_002' THEN id END) AS t2_id,
    MAX(CASE WHEN openid='wx_student_001' THEN id END) AS s1_id,
    MAX(CASE WHEN openid='wx_student_002' THEN id END) AS s2_id,
    MAX(CASE WHEN openid='wx_student_003' THEN id END) AS s3_id
  FROM users
)
SELECT * FROM u;  -- 可见即可，不影响事务

-- ------------------------------------------------
-- (2) TASK TAGS (Hierarchy)
-- ------------------------------------------------
-- Primary
INSERT INTO task_tags (name, level, parent_id, display_name, description, color, icon,
                       sort_order, is_active, usage_count, created_at, updated_at)
VALUES
('xingce', 'PRIMARY', NULL, '行测', '行政职业能力测验', '#1890ff', 'icon-test', 1, TRUE, 0, NOW(), NOW()),
('shenlun', 'PRIMARY', NULL, '申论', '申论写作训练', '#52c41a', 'icon-write', 2, TRUE, 0, NOW(), NOW()),
('mianshi', 'PRIMARY', NULL, '面试', '面试技巧练习', '#722ed1', 'icon-interview', 3, TRUE, 0, NOW(), NOW());

-- Secondary (children of xingce)
INSERT INTO task_tags (name, level, parent_id, display_name, description, color, icon,
                       sort_order, is_active, usage_count, created_at, updated_at)
VALUES
('yuyan',   'SECONDARY', (SELECT id FROM task_tags WHERE name='xingce'), '言语理解', '言语理解与表达', '#1890ff', NULL, 1, TRUE, 0, NOW(), NOW()),
('shuliang','SECONDARY', (SELECT id FROM task_tags WHERE name='xingce'), '数量关系', '数量关系推理',   '#1890ff', NULL, 2, TRUE, 0, NOW(), NOW()),
('panduan', 'SECONDARY', (SELECT id FROM task_tags WHERE name='xingce'), '判断推理', '逻辑判断推理',   '#1890ff', NULL, 3, TRUE, 0, NOW(), NOW());

-- ------------------------------------------------
-- (3) TASKS (created_by = teachers)
-- ------------------------------------------------
INSERT INTO tasks (
  title, course, "desc", total_score, deadline, status, task_type,
  suite_id, paper_name, created_by, created_at, updated_at
) VALUES
('行测言语理解综合练习', '行测',
 '完成30道言语理解题目，重点练习主旨概括题和意图判断题。包含阅读理解、语句表达等多种题型，难度适中。',
 40.0, NOW() + INTERVAL '3 days', 'ONGOING', 'LIVE',
 'suite_001', '言语理解专项训练A卷',
 (SELECT id FROM users WHERE openid='wx_teacher_001'), NOW(), NOW()),

('申论热点分析写作', '申论',
 '围绕主题“数字化转型”撰写1000字政策建议报告，要求论证充分、建议可行。',
 60.0, NOW() + INTERVAL '5 days', 'ONGOING', 'EXTRA',
 'suite_002', '热点分析专题',
 (SELECT id FROM users WHERE openid='wx_teacher_001'), NOW(), NOW()),

('数量关系突破训练', '行测',
 '完成20道数量关系题，掌握工程、概率、几何等题型技巧。',
 35.0, NOW() + INTERVAL '2 days', 'ONGOING', 'NORMAL',
 NULL, NULL,
 (SELECT id FROM users WHERE openid='wx_teacher_002'), NOW(), NOW()),

('面试模拟实战练习', '面试',
 '录制3分钟自我介绍视频，准备结构化面试常见问题的回答。',
 50.0, NOW() + INTERVAL '7 days', 'ONGOING', 'LIVE',
 NULL, NULL,
 (SELECT id FROM users WHERE openid='wx_teacher_002'), NOW(), NOW()),

('逻辑判断专项突破', '行测',
 '完成25道判断推理题（图形推理/定义判断/类比推理/逻辑判断）。',
 45.0, NOW() + INTERVAL '4 days', 'ONGOING', 'NORMAL',
 'suite_003', '判断推理综合卷',
 (SELECT id FROM users WHERE openid='wx_teacher_001'), NOW(), NOW());

-- ------------------------------------------------
-- (4) TASK TAG USAGES
-- ------------------------------------------------
-- 行测言语理解综合练习
INSERT INTO task_tag_usages (task_id, tag_id, created_by, created_at) VALUES
((SELECT id FROM tasks WHERE title='行测言语理解综合练习'),
 (SELECT id FROM task_tags WHERE name='xingce'),
 (SELECT id FROM users WHERE openid='wx_teacher_001'), NOW()),
((SELECT id FROM tasks WHERE title='行测言语理解综合练习'),
 (SELECT id FROM task_tags WHERE name='yuyan'),
 (SELECT id FROM users WHERE openid='wx_teacher_001'), NOW());

-- 申论热点分析写作
INSERT INTO task_tag_usages (task_id, tag_id, created_by, created_at) VALUES
((SELECT id FROM tasks WHERE title='申论热点分析写作'),
 (SELECT id FROM task_tags WHERE name='shenlun'),
 (SELECT id FROM users WHERE openid='wx_teacher_001'), NOW());

-- 数量关系突破训练
INSERT INTO task_tag_usages (task_id, tag_id, created_by, created_at) VALUES
((SELECT id FROM tasks WHERE title='数量关系突破训练'),
 (SELECT id FROM task_tags WHERE name='xingce'),
 (SELECT id FROM users WHERE openid='wx_teacher_002'), NOW()),
((SELECT id FROM tasks WHERE title='数量关系突破训练'),
 (SELECT id FROM task_tags WHERE name='shuliang'),
 (SELECT id FROM users WHERE openid='wx_teacher_002'), NOW());

-- 面试模拟实战练习
INSERT INTO task_tag_usages (task_id, tag_id, created_by, created_at) VALUES
((SELECT id FROM tasks WHERE title='面试模拟实战练习'),
 (SELECT id FROM task_tags WHERE name='mianshi'),
 (SELECT id FROM users WHERE openid='wx_teacher_002'), NOW());

-- 逻辑判断专项突破
INSERT INTO task_tag_usages (task_id, tag_id, created_by, created_at) VALUES
((SELECT id FROM tasks WHERE title='逻辑判断专项突破'),
 (SELECT id FROM task_tags WHERE name='xingce'),
 (SELECT id FROM users WHERE openid='wx_teacher_001'), NOW()),
((SELECT id FROM tasks WHERE title='逻辑判断专项突破'),
 (SELECT id FROM task_tags WHERE name='panduan'),
 (SELECT id FROM users WHERE openid='wx_teacher_001'), NOW());

-- ------------------------------------------------
-- (5) SUBMISSIONS
-- ------------------------------------------------
INSERT INTO submissions
(task_id, student_id, images, text, submission_count, status,
 score, grade, feedback, graded_by, graded_at, created_at, updated_at)
VALUES
-- 张小明
((SELECT id FROM tasks WHERE title='行测言语理解综合练习'),
 (SELECT id FROM users WHERE openid='wx_student_001'),
 '["https://example.com/sub1_1.jpg","https://example.com/sub1_2.jpg"]',
 '这道题我选择B，因为文章重点在教育公平…', 1, 'GRADED',
 35.0, 'GOOD', '思路清晰，建议加强概括能力。', (SELECT id FROM users WHERE openid='wx_teacher_001'),
 NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 days', NOW()),

((SELECT id FROM tasks WHERE title='申论热点分析写作'),
 (SELECT id FROM users WHERE openid='wx_student_001'),
 '["https://example.com/sub2_1.jpg"]',
 '关于数字化转型的建议：一、加强基础设施…', 1, 'SUBMITTED',
 NULL, NULL, NULL, NULL, NULL, NOW() - INTERVAL '1 day', NOW()),

-- 李小红
((SELECT id FROM tasks WHERE title='行测言语理解综合练习'),
 (SELECT id FROM users WHERE openid='wx_student_002'),
 '["https://example.com/sub1_3.jpg"]',
 '我选A，文段主要说明…', 1, 'GRADED',
 28.0, 'PENDING', '理解基本正确，需要更准确把握中心。', (SELECT id FROM users WHERE openid='wx_teacher_001'),
 NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 day', NOW()),

((SELECT id FROM tasks WHERE title='数量关系突破训练'),
 (SELECT id FROM users WHERE openid='wx_student_002'),
 '["https://example.com/sub3_1.jpg","https://example.com/sub3_2.jpg"]',
 '工程问题步骤：1.设总量为1，2.列方程…', 1, 'SUBMITTED',
 NULL, NULL, NULL, NULL, NULL, NOW() - INTERVAL '3 hours', NOW());

-- ------------------------------------------------
-- (6) USER CHECKINS
-- ------------------------------------------------
INSERT INTO user_checkins (user_id, checkin_date, checkin_type, related_task_id, related_submission_id, created_at) VALUES
((SELECT id FROM users WHERE openid='wx_student_001'), CURRENT_DATE,                    'SUBMISSION', (SELECT id FROM tasks WHERE title='行测言语理解综合练习'), (SELECT id FROM submissions WHERE text LIKE '这道题我选择B%' LIMIT 1), NOW()),
((SELECT id FROM users WHERE openid='wx_student_001'), CURRENT_DATE - INTERVAL '1 day','TASK_VIEW',  (SELECT id FROM tasks WHERE title='申论热点分析写作'), NULL, NOW() - INTERVAL '1 day'),
((SELECT id FROM users WHERE openid='wx_student_001'), CURRENT_DATE - INTERVAL '2 days','SUBMISSION', (SELECT id FROM tasks WHERE title='行测言语理解综合练习'), NULL, NOW() - INTERVAL '2 days'),
((SELECT id FROM users WHERE openid='wx_student_001'), CURRENT_DATE - INTERVAL '3 days','TASK_VIEW',  (SELECT id FROM tasks WHERE title='数量关系突破训练'), NULL, NOW() - INTERVAL '3 days'),

((SELECT id FROM users WHERE openid='wx_student_002'), CURRENT_DATE,                    'SUBMISSION', (SELECT id FROM tasks WHERE title='数量关系突破训练'), (SELECT id FROM submissions WHERE text LIKE '工程问题步骤%' LIMIT 1), NOW()),
((SELECT id FROM users WHERE openid='wx_student_002'), CURRENT_DATE - INTERVAL '1 day','TASK_VIEW',  (SELECT id FROM tasks WHERE title='行测言语理解综合练习'), NULL, NOW() - INTERVAL '1 day'),
((SELECT id FROM users WHERE openid='wx_student_002'), CURRENT_DATE - INTERVAL '2 days','SUBMISSION', (SELECT id FROM tasks WHERE title='行测言语理解综合练习'), (SELECT id FROM submissions WHERE text LIKE '我选A，文段主要说明%' LIMIT 1), NOW() - INTERVAL '2 days');

-- ------------------------------------------------
-- (7) USER SCORE RECORDS
-- ------------------------------------------------
INSERT INTO user_score_records
(user_id, score_type, score_value, description, record_date, year, month, quarter,
 related_task_id, related_submission_id, created_at)
VALUES
((SELECT id FROM users WHERE openid='wx_student_001'),'SUBMISSION',  1,'提交作业：行测言语理解练习', CURRENT_DATE - INTERVAL '2 days', EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM CURRENT_DATE)::int, EXTRACT(QUARTER FROM CURRENT_DATE)::int, (SELECT id FROM tasks WHERE title='行测言语理解综合练习'), (SELECT id FROM submissions WHERE text LIKE '这道题我选择B%' LIMIT 1), NOW() - INTERVAL '2 days'),
((SELECT id FROM users WHERE openid='wx_student_001'),'GOOD_GRADE',  2,'获得优秀评价：行测言语理解练习', CURRENT_DATE - INTERVAL '1 day', EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM CURRENT_DATE)::int, EXTRACT(QUARTER FROM CURRENT_DATE)::int, (SELECT id FROM tasks WHERE title='行测言语理解综合练习'), (SELECT id FROM submissions WHERE text LIKE '这道题我选择B%' LIMIT 1), NOW() - INTERVAL '1 day'),
((SELECT id FROM users WHERE openid='wx_student_001'),'SUBMISSION',  1,'提交作业：申论热点分析',       CURRENT_DATE - INTERVAL '1 day', EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM CURRENT_DATE)::int, EXTRACT(QUARTER FROM CURRENT_DATE)::int, (SELECT id FROM tasks WHERE title='申论热点分析写作'), (SELECT id FROM submissions WHERE text LIKE '关于数字化转型的建议%' LIMIT 1), NOW() - INTERVAL '1 day'),

((SELECT id FROM users WHERE openid='wx_student_002'),'SUBMISSION',  1,'提交作业：行测言语理解练习', CURRENT_DATE - INTERVAL '1 day', EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM CURRENT_DATE)::int, EXTRACT(QUARTER FROM CURRENT_DATE)::int, (SELECT id FROM tasks WHERE title='行测言语理解综合练习'), (SELECT id FROM submissions WHERE text LIKE '我选A，文段主要说明%' LIMIT 1), NOW() - INTERVAL '1 day'),
((SELECT id FROM users WHERE openid='wx_student_002'),'SUBMISSION',  1,'提交作业：数量关系训练',       CURRENT_DATE,                    EXTRACT(YEAR FROM CURRENT_DATE)::int, EXTRACT(MONTH FROM CURRENT_DATE)::int, EXTRACT(QUARTER FROM CURRENT_DATE)::int, (SELECT id FROM tasks WHERE title='数量关系突破训练'), (SELECT id FROM submissions WHERE text LIKE '工程问题步骤%' LIMIT 1), NOW());

-- ------------------------------------------------
-- (8) MATERIALS (+ collections/views/likes)
-- ------------------------------------------------
INSERT INTO materials
(title, description, material_type, status, file_url, external_url, content,
 file_size, duration, file_format, thumbnail_url, category, tags,
 priority, sort_order, is_public, required_subscription,
 view_count, download_count, like_count, created_by,
 created_at, updated_at, published_at)
VALUES
('行测高频词汇手册','收录高频词汇1000个，含解析与例句。','DOCUMENT','PUBLISHED',
 'https://example.com/files/vocab_handbook.pdf', NULL, NULL,
 2048000, NULL, 'pdf', 'https://example.com/thumbs/vocab_thumb.jpg',
 '理论', '["词汇","行测","基础"]',
 5,1, TRUE, FALSE, 156, 89, 23, (SELECT id FROM users WHERE openid='wx_teacher_001'),
 NOW() - INTERVAL '10 days', NOW(), NOW() - INTERVAL '9 days'),

('申论写作技巧视频教程','解析申论写作五大技巧，含实例与练习。','VIDEO','PUBLISHED',
 'https://example.com/videos/writing_skills.mp4', NULL, NULL,
 15728640, 1800, 'mp4', 'https://example.com/thumbs/video_thumb.jpg',
 '技巧', '["申论","写作","技巧"]',
 8,2, TRUE, TRUE, 234, 67, 45, (SELECT id FROM users WHERE openid='wx_teacher_001'),
 NOW() - INTERVAL '15 days', NOW(), NOW() - INTERVAL '14 days'),

('2025年时政热点汇总','整理2025年1-9月时政与政策解读。','DOCUMENT','PUBLISHED',
 'https://example.com/files/current_affairs_2025.pdf', NULL, NULL,
 5242880, NULL, 'pdf', NULL,
 '时政', '["时政","热点","2025"]',
 9,3, TRUE, FALSE, 312, 128, 67, (SELECT id FROM users WHERE openid='wx_teacher_002'),
 NOW() - INTERVAL '5 days', NOW(), NOW() - INTERVAL '4 days'),

('面试真题解析音频','历年面试真题逐题解析与思路。','AUDIO','PUBLISHED',
 'https://example.com/audio/interview_analysis.mp3', NULL, NULL,
 8388608, 3600, 'mp3', NULL,
 '真题', '["面试","真题","解析"]',
 7,4, TRUE, TRUE, 187, 45, 34, (SELECT id FROM users WHERE openid='wx_teacher_002'),
 NOW() - INTERVAL '8 days', NOW(), NOW() - INTERVAL '7 days');

-- Collections
INSERT INTO material_collections (user_id, material_id, collected_at, notes) VALUES
((SELECT id FROM users WHERE openid='wx_student_001'), (SELECT id FROM materials WHERE title='行测高频词汇手册'), NOW() - INTERVAL '5 days', '行测基础必备资料'),
((SELECT id FROM users WHERE openid='wx_student_001'), (SELECT id FROM materials WHERE title='申论写作技巧视频教程'), NOW() - INTERVAL '3 days', '申论写作很有帮助'),
((SELECT id FROM users WHERE openid='wx_student_001'), (SELECT id FROM materials WHERE title='2025年时政热点汇总'), NOW() - INTERVAL '2 days', NULL),
((SELECT id FROM users WHERE openid='wx_student_002'), (SELECT id FROM materials WHERE title='行测高频词汇手册'), NOW() - INTERVAL '4 days', '词汇量需要提升'),
((SELECT id FROM users WHERE openid='wx_student_002'), (SELECT id FROM materials WHERE title='面试真题解析音频'), NOW() - INTERVAL '1 day', '面试准备阶段收藏');

-- ------------------------------------------------
-- (9) NOTIFICATIONS
-- ------------------------------------------------
INSERT INTO notifications
(user_id, notification_type, title, content, related_task_id, related_submission_id,
 status, sent_at, error_message, retry_count, created_at)
VALUES
((SELECT id FROM users WHERE openid='wx_student_001'),'grade_complete','作业批改完成','您提交的“行测言语理解练习”已批改，35分，评价：优秀',
 (SELECT id FROM tasks WHERE title='行测言语理解综合练习'),
 (SELECT id FROM submissions WHERE text LIKE '这道题我选择B%' LIMIT 1),
 'SENT', NOW() - INTERVAL '1 day', NULL, 0, NOW() - INTERVAL '1 day'),

((SELECT id FROM users WHERE openid='wx_student_001'),'deadline_reminder','作业截止提醒','任务“申论热点分析写作”将在2小时后截止，请及时完成',
 (SELECT id FROM tasks WHERE title='申论热点分析写作'), NULL,
 'SENT', NOW() - INTERVAL '2 hours', NULL, 0, NOW() - INTERVAL '2 hours'),

((SELECT id FROM users WHERE openid='wx_student_002'),'grade_complete','作业批改完成','您提交的“行测言语理解练习”已批改，28分，评价：待复盘',
 (SELECT id FROM tasks WHERE title='行测言语理解综合练习'),
 (SELECT id FROM submissions WHERE text LIKE '我选A，文段主要说明%' LIMIT 1),
 'SENT', NOW() - INTERVAL '2 hours', NULL, 0, NOW() - INTERVAL '2 hours');

-- ------------------------------------------------
-- (10) NOTIFICATION SETTINGS
-- ------------------------------------------------
INSERT INTO notification_settings
(user_id, grade_complete_enabled, deadline_reminder_enabled, new_task_enabled,
 streak_break_reminder, quiet_hours_start, quiet_hours_end, created_at, updated_at)
VALUES
((SELECT id FROM users WHERE openid='wx_student_001'), TRUE, TRUE,  TRUE,  TRUE, 22, 8, NOW(), NOW()),
((SELECT id FROM users WHERE openid='wx_student_002'), TRUE, FALSE, TRUE, FALSE, 23, 7, NOW(), NOW()),
((SELECT id FROM users WHERE openid='wx_student_003'), FALSE, FALSE, FALSE, FALSE, 22, 8, NOW(), NOW());

-- ------------------------------------------------
-- (11) REVIEW SETTINGS
-- ------------------------------------------------
INSERT INTO review_settings
(user_id, frequency, custom_days, preferred_time, reminder_enabled,
 include_scores, include_mistakes, include_progress, include_suggestions,
 last_review_date, next_review_date, total_reviews, created_at, updated_at)
VALUES
((SELECT id FROM users WHERE openid='wx_student_001'),'WEEKLY', NULL, 20, TRUE, TRUE, TRUE, TRUE, TRUE,
 CURRENT_DATE - INTERVAL '3 days', CURRENT_DATE + INTERVAL '4 days', 2, NOW(), NOW()),

((SELECT id FROM users WHERE openid='wx_student_002'),'DAILY',  NULL, 19, TRUE, TRUE, FALSE, TRUE, TRUE,
 CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE, 5, NOW(), NOW());

-- ------------------------------------------------
-- (12) Quick Checks (optional)
-- ------------------------------------------------
-- SELECT 'users' AS t, COUNT(*) FROM users WHERE openid LIKE 'wx_%'
-- UNION ALL SELECT 'tasks', COUNT(*) FROM tasks
-- UNION ALL SELECT 'submissions', COUNT(*) FROM submissions
-- UNION ALL SELECT 'task_tags', COUNT(*) FROM task_tags
-- UNION ALL SELECT 'materials', COUNT(*) FROM materials;

COMMIT;
