#import "LCAppDelegate.h"
#import "LCViewController.h"

@implementation LCAppDelegate

- (BOOL)application:(UIApplication*)application didFinishLaunchingWithOptions:(NSDictionary*)launchOptions
{
    (void) application;
    (void) launchOptions;

    self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
    self.window.rootViewController = [[LCViewController alloc] init];
    [self.window makeKeyAndVisible];
    return YES;
}

@end
