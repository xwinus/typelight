#import <AppKit/AppKit.h>

@interface InstallerFixture : NSObject <NSApplicationDelegate>
@property NSString *marker;
@end

@implementation InstallerFixture
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [@"ready" writeToFile:[self.marker stringByAppendingString:@".ready"]
              atomically:YES encoding:NSUTF8StringEncoding error:nil];
}
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 300 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
        [@"pending writing saved" writeToFile:self.marker atomically:YES encoding:NSUTF8StringEncoding error:nil];
        [sender replyToApplicationShouldTerminate:YES];
    });
    return NSTerminateLater;
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 2) return 2;
        NSApplication *app = NSApplication.sharedApplication;
        [app setActivationPolicy:NSApplicationActivationPolicyProhibited];
        InstallerFixture *delegate = [InstallerFixture new];
        delegate.marker = [NSString stringWithUTF8String:argv[1]];
        app.delegate = delegate;
        [app run];
    }
    return 0;
}
