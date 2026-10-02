-- Existing achievement conditions already cover these milestones.
insert into public.achievements (id, name, description, icon, xp_reward, condition_type, condition_value)
values
  ('10000000-0000-4000-8000-000000000009', 'AI Study Partner', 'Talk to RevIT AI 5 times', 'AI5', 50, 'ai_messages', 5),
  ('10000000-0000-4000-8000-000000000010', 'Question Builder', 'Answer 250 questions', '250', 75, 'questions_answered', 250),
  ('10000000-0000-4000-8000-000000000011', 'Dedicated Learner', 'Complete 25 study sessions', '25', 150, 'study_sessions', 25),
  ('10000000-0000-4000-8000-000000000012', '14 Day Streak', 'Study for 14 consecutive days', '14×', 150, 'streak_days', 14)
on conflict (id) do nothing;
