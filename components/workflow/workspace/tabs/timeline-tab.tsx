import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { money, num, formatDate } from '@/lib/format';
import { TimelineEvent } from '../types';
import { statusBadgeVariant } from '../utils';

export function TimelineTab({ events }: { events: TimelineEvent[] }) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm">Order Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {events.length === 0 ? (
                    <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                        No timeline event yet.
                    </div>
                ) : (
                    events.map((event) => (
                        <div
                            key={event.id}
                            className="grid grid-cols-[140px_1fr] gap-3 rounded-lg border p-3"
                        >
                            <div className="text-xs text-muted-foreground">
                                <div>{formatDate(event.at)}</div>
                            </div>
                            <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">{event.title}</span>
                                    <Badge variant="outline">{event.entityType}</Badge>
                                    {event.status && (
                                        <Badge variant={statusBadgeVariant(event.status)}>{event.status}</Badge>
                                    )}
                                    {event.amount !== null && (
                                        <Badge variant="secondary">{money(num(event.amount))}</Badge>
                                    )}
                                </div>
                                {event.description && (
                                    <div className="text-sm text-muted-foreground">{event.description}</div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    );
}
