import { SessionList } from '@/components/dashboard/session-list';
import { CreateSessionButton } from '@/components/dashboard/create-session-button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function DashboardPage() {
    return (
        <div className="space-y-8">
            <div className="md:flex md:items-center md:justify-between">
                <div className="min-w-0 flex-1">
                    <h2 className="text-fluid-2xl">
                        My Renovations
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Manage your renovation projects and track progress.
                    </p>
                </div>
                <div className="mt-4 flex md:ml-4 md:mt-0">
                    <CreateSessionButton />
                </div>
            </div>

            <Card>
                <CardHeader className="sr-only">
                    <h3>Session List</h3>
                </CardHeader>
                <CardContent className="p-0 sm:p-6">
                    <SessionList />
                </CardContent>
            </Card>
        </div>
    );
}
