import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Empty, RoleBadge } from '../components/ui';

export default function Forbidden({ perm }: { perm: string }) {
  const { user } = useAuth();
  return (
    <div className="section" style={{ display: 'grid', placeItems: 'center', flex: 1 }}>
      <Empty icon={<Lock size={20} />} title="You don't have access to this page"
        action={<Link to="/" className="btn">Back to dashboard</Link>}>
        This area needs the <code>{perm}</code> permission, which isn't part of the{' '}
        {user && <RoleBadge role={user.role} />} role. Ask an admin if you need it.
      </Empty>
    </div>
  );
}
