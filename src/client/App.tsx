import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { RequireAuth } from './components/RequireAuth';
import { HomePage } from './pages/HomePage';
import { TrendingPage } from './pages/TrendingPage';
import { FollowingPage } from './pages/FollowingPage';
import { BookmarksPage } from './pages/BookmarksPage';
import { ArticlePage } from './pages/ArticlePage';
import { EditorPage } from './pages/EditorPage';
import { ProfilePage } from './pages/ProfilePage';
import { TopicPage } from './pages/TopicPage';
import { DraftsPage } from './pages/DraftsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { CommunitiesPage } from './pages/CommunitiesPage';
import { CommunityPage } from './pages/CommunityPage';
import { CommunityEditorPage } from './pages/CommunityEditorPage';
import { AccountSettingsPage } from './pages/AccountSettingsPage';
import { SummarizePage } from './pages/SummarizePage';
import { AggregatePage } from './pages/AggregatePage';
import { InvitePage } from './pages/InvitePage';
import { SearchPage } from './pages/SearchPage';
import { AdminSettingPage } from './pages/AdminSettingPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminInvitePage } from './pages/AdminInvitePage';
import { ChatRoomsPage } from './pages/ChatRoomsPage';
import { ChatRoomPage } from './pages/ChatRoomPage';
import { ChatRoomSettingsPage } from './pages/ChatRoomSettingsPage';
import { PulseSurveyPage } from './pages/PulseSurveyPage';
import { useFeatures } from './useFeatures';
import { Navigate } from 'react-router-dom';

function RequireFeature({ feature, children }: { feature: 'chat' | 'pulse'; children: React.ReactNode }) {
  const f = useFeatures();
  if (!f[feature]) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        {/* 公開 */}
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/trending" element={<TrendingPage />} />
        <Route path="/articles/:id" element={<ArticlePage />} />
        <Route path="/users/:id" element={<ProfilePage />} />
        <Route path="/topics/:slug" element={<TopicPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* 要ログイン */}
        <Route
          path="/following"
          element={
            <RequireAuth>
              <FollowingPage />
            </RequireAuth>
          }
        />
        <Route
          path="/bookmarks"
          element={
            <RequireAuth>
              <BookmarksPage />
            </RequireAuth>
          }
        />
        <Route
          path="/editor"
          element={
            <RequireAuth>
              <EditorPage />
            </RequireAuth>
          }
        />
        <Route
          path="/editor/:id"
          element={
            <RequireAuth>
              <EditorPage />
            </RequireAuth>
          }
        />
        <Route
          path="/me/drafts"
          element={
            <RequireAuth>
              <DraftsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/chat"
          element={
            <RequireAuth>
              <RequireFeature feature="chat"><ChatRoomsPage /></RequireFeature>
            </RequireAuth>
          }
        />
        <Route
          path="/chat/:id"
          element={
            <RequireAuth>
              <RequireFeature feature="chat"><ChatRoomPage /></RequireFeature>
            </RequireAuth>
          }
        />
        <Route
          path="/chat/:id/settings"
          element={
            <RequireAuth>
              <RequireFeature feature="chat"><ChatRoomSettingsPage /></RequireFeature>
            </RequireAuth>
          }
        />
        <Route path="/communities" element={<RequireAuth><CommunitiesPage /></RequireAuth>} />
        <Route path="/communities/:id" element={<RequireAuth><CommunityPage /></RequireAuth>} />
        <Route
          path="/pulse"
          element={
            <RequireAuth>
              <RequireFeature feature="pulse"><PulseSurveyPage /></RequireFeature>
            </RequireAuth>
          }
        />
        <Route
          path="/communities/:communityId/editor"
          element={
            <RequireAuth>
              <CommunityEditorPage />
            </RequireAuth>
          }
        />
        <Route
          path="/me/settings"
          element={
            <RequireAuth>
              <AccountSettingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/me/summarize"
          element={
            <RequireAuth>
              <SummarizePage />
            </RequireAuth>
          }
        />
        <Route
          path="/me/aggregate"
          element={
            <RequireAuth>
              <AggregatePage />
            </RequireAuth>
          }
        />
        <Route path="/admin-setting" element={<AdminSettingPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/invite/:token" element={<AdminInvitePage />} />
        <Route
          path="/invite/:token"
          element={
            <RequireAuth>
              <InvitePage />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
