'use client';

import { User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">User Management</h1>
        <p className="text-sm text-gray-500 mt-1">Manage system users and permissions</p>
      </div>
      <Card className="border-gray-200 shadow-sm">
        <CardContent className="flex flex-col items-center justify-center py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 mb-4">
            <User className="h-8 w-8 text-gray-400" />
          </div>
          <p className="text-gray-500">User management coming soon</p>
        </CardContent>
      </Card>
    </div>
  );
}
