import { SessionList } from '@/components/dashboard/session-list';
import { CreateSessionButton } from '@/components/dashboard/create-session-button';

export default function DashboardPage() {
    return (
        <div className="space-y-8">
            <div className="md:flex md:items-center md:justify-between">
                <div className="min-w-0 flex-1">
                    <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                        My Renovations
                    </h2>
                </div>
                <div className="mt-4 flex md:ml-4 md:mt-0">
                    <CreateSessionButton />
                </div>
            </div>

            <div className="bg-white shadow sm:rounded-lg px-4 py-5 sm:p-6">
                <SessionList />
            </div>
        </div>
    );
}
