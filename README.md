# Navigator Web

A Progressive Web App (PWA) for field workers managing address lists and navigation routes. Built with React, TypeScript, and Vite with real-time cloud synchronization.

## 🚀 Features

- **Address Management**: Import, organize, and track completion of address lists
- **Route Optimization**: Intelligent arrangement of addresses for efficient field work
- **Offline Support**: Full functionality without internet connection using IndexedDB
- **Cloud Sync**: Real-time synchronization with Supabase backend
- **Session Tracking**: Monitor daily work sessions and productivity
- **Touch Navigation**: Swipe-based interface optimized for mobile devices
- **PWA Ready**: Install as native app on mobile and desktop

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: CSS3 with modern features
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Offline Storage**: IndexedDB via idb-keyval
- **Authentication**: Supabase Auth
- **Build Tool**: Vite with HMR
- **PWA**: Service Worker + Web App Manifest

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd navigator-web
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Add your Supabase credentials
   ```

4. **Run database setup** (see Database Setup section)

## 🏃‍♂️ Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Deploy to GitHub Pages
npm run deploy
```

## 🗄️ Database Setup

The app uses Supabase with Row Level Security for data protection.

### Initial Setup

1. **Create Supabase project** at [supabase.com](https://supabase.com)

2. **Run SQL scripts in order**:
   ```sql
   -- 1. Add user_id columns
   database/add-user-id-columns.sql
   
   -- 2. Enable Row Level Security
   database/enable-rls.sql
   
   -- 3. Create security policies
   database/create-rls-policies.sql
   ```

3. **Verify setup** using queries in `database/README-RLS-Setup.md`

### Tables

- `navigator_state`: Main application state per user
- `navigator_operations`: Sync operation queue
- `entity_store`: Address and completion data
- `sync_oplog`: Synchronization logs

## 🔐 Security

- **Row Level Security**: Users can only access their own data
- **Authentication**: Supabase Auth with session management
- **Data Isolation**: Complete user data separation
- **Secure Sync**: All operations include user context

## 📱 Usage

1. **Authentication**: Sign up or log in to sync data
2. **Import Addresses**: Add address lists for field work
3. **Arrange Routes**: Optimize order for efficient navigation
4. **Track Progress**: Mark addresses as completed during field work
5. **Session Management**: Monitor daily work sessions
6. **Offline Mode**: Continue working without internet connection

## 🏗️ Architecture

- **State Management**: React hooks with local and cloud persistence
- **Sync Strategy**: Optimistic updates with conflict resolution
- **Offline Support**: IndexedDB for local storage
- **Real-time Updates**: Supabase real-time subscriptions
- **Performance**: React.memo, code splitting, and bundle optimization

## 🔧 Configuration

### Environment Variables

```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### PWA Settings

Configure in `public/manifest.json` and `vite.config.ts`.

## 📂 Project Structure

```
src/
├── components/          # Reusable UI components
├── hooks/              # Custom React hooks
├── lib/                # External service clients
├── utils/              # Utility functions
├── types.ts            # TypeScript type definitions
├── App.tsx             # Main application component
└── main.tsx           # Application entry point

database/               # SQL scripts and documentation
├── add-user-id-columns.sql
├── enable-rls.sql
├── create-rls-policies.sql
└── README-RLS-Setup.md

public/                 # Static assets and PWA files
```

## 🚀 Deployment

1. **Build the project**
   ```bash
   npm run build
   ```

2. **Deploy to your hosting platform**
   - GitHub Pages: `npm run deploy`
   - Vercel, Netlify, or any static host
   - Ensure environment variables are set

3. **Configure PWA**
   - Update manifest.json with your domain
   - Test service worker functionality

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and build
5. Submit a pull request

## 📄 License

This project is private and proprietary.

## 🆘 Support

For issues and questions:
1. Check existing issues in the repository
2. Review the database setup documentation
3. Verify environment configuration
4. Test authentication flow

---

Built with ❤️ for efficient field work management.