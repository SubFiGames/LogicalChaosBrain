#import <Foundation/Foundation.h>

#ifdef __cplusplus
namespace logicalchaos { class LogicalChaosEngine; }
#endif

@interface LCAudioEngine : NSObject

- (instancetype)initWithEngine:(logicalchaos::LogicalChaosEngine*)engine;

- (BOOL)startAndReturnError:(NSError**)error;
- (void)stop;
- (void)resetPlayback;
- (BOOL)isRunning;

@end
