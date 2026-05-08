#import "LCViewController.h"
#import "LCAudioEngine.h"

#include "LogicalChaosEngine.h"

#include <sstream>

using logicalchaos::LogicalChaosEngine;

@interface LCViewController ()
@property (nonatomic, strong) UILabel* titleLabel;
@property (nonatomic, strong) UILabel* subtitleLabel;
@property (nonatomic, strong) UILabel* statusLabel;
@property (nonatomic, strong) UITextView* patternView;
@property (nonatomic, strong) LCAudioEngine* audioEngine;
@end

@implementation LCViewController
{
    LogicalChaosEngine engine_;
}

- (void)viewDidLoad
{
    [super viewDidLoad];

    self.view.backgroundColor = [UIColor colorWithRed:0.008 green:0.067 blue:0.067 alpha:1.0];

    UIStackView* root = [[UIStackView alloc] init];
    root.translatesAutoresizingMaskIntoConstraints = NO;
    root.axis = UILayoutConstraintAxisVertical;
    root.spacing = 14.0;
    root.layoutMarginsRelativeArrangement = YES;
    root.layoutMargins = UIEdgeInsetsMake (22, 18, 18, 18);
    [self.view addSubview:root];

    [NSLayoutConstraint activateConstraints:@[
        [root.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor],
        [root.leadingAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.leadingAnchor],
        [root.trailingAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.trailingAnchor],
        [root.bottomAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.bottomAnchor]
    ]];

    self.titleLabel = [[UILabel alloc] init];
    self.titleLabel.text = @"LOGICAL CHAOS";
    self.titleLabel.textColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:1.0];
    self.titleLabel.font = [UIFont systemFontOfSize:30 weight:UIFontWeightBlack];
    self.titleLabel.textAlignment = NSTextAlignmentCenter;
    [root addArrangedSubview:self.titleLabel];

    self.subtitleLabel = [[UILabel alloc] init];
    self.subtitleLabel.text = @"iOS Standalone Audio Test";
    self.subtitleLabel.textColor = [UIColor colorWithWhite:0.82 alpha:0.70];
    self.subtitleLabel.font = [UIFont systemFontOfSize:13 weight:UIFontWeightBold];
    self.subtitleLabel.textAlignment = NSTextAlignmentCenter;
    [root addArrangedSubview:self.subtitleLabel];

    self.statusLabel = [[UILabel alloc] init];
    self.statusLabel.text = @"Audio: stopped";
    self.statusLabel.textColor = [UIColor colorWithRed:1.0 green:0.48 blue:1.0 alpha:0.90];
    self.statusLabel.font = [UIFont systemFontOfSize:12 weight:UIFontWeightBold];
    self.statusLabel.textAlignment = NSTextAlignmentCenter;
    [root addArrangedSubview:self.statusLabel];

    UIStackView* buttons = [[UIStackView alloc] init];
    buttons.axis = UILayoutConstraintAxisHorizontal;
    buttons.spacing = 8.0;
    buttons.distribution = UIStackViewDistributionFillEqually;
    [root addArrangedSubview:buttons];

    [buttons addArrangedSubview:[self makeButton:@"PLAY" action:@selector(playTapped) primary:YES]];
    [buttons addArrangedSubview:[self makeButton:@"STOP" action:@selector(stopTapped) primary:NO]];
    [buttons addArrangedSubview:[self makeButton:@"GENERATE" action:@selector(generateTapped) primary:NO]];

    UIStackView* editButtons = [[UIStackView alloc] init];
    editButtons.axis = UILayoutConstraintAxisHorizontal;
    editButtons.spacing = 8.0;
    editButtons.distribution = UIStackViewDistributionFillEqually;
    [root addArrangedSubview:editButtons];

    [editButtons addArrangedSubview:[self makeButton:@"MUTATE" action:@selector(mutateTapped) primary:NO]];
    [editButtons addArrangedSubview:[self makeButton:@"CLEAR" action:@selector(clearTapped) primary:NO]];

    self.patternView = [[UITextView alloc] init];
    self.patternView.translatesAutoresizingMaskIntoConstraints = NO;
    self.patternView.editable = NO;
    self.patternView.selectable = YES;
    self.patternView.backgroundColor = [UIColor colorWithRed:0.0 green:0.0 blue:0.0 alpha:0.26];
    self.patternView.textColor = [UIColor colorWithWhite:0.92 alpha:1.0];
    self.patternView.font = [UIFont monospacedSystemFontOfSize:13 weight:UIFontWeightRegular];
    self.patternView.layer.cornerRadius = 14.0;
    self.patternView.layer.borderWidth = 1.0;
    self.patternView.layer.borderColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:0.20].CGColor;
    self.patternView.textContainerInset = UIEdgeInsetsMake (12, 12, 12, 12);
    [root addArrangedSubview:self.patternView];

    [self.patternView.heightAnchor constraintGreaterThanOrEqualToConstant:320.0].active = YES;

    engine_.resetToDefaults();
    engine_.triggerEvent ("generate", 1.0);
    self.audioEngine = [[LCAudioEngine alloc] initWithEngine:&engine_];
    [self refreshPatternText:@"Generated default pattern from shared C++ engine."];
}

- (UIButton*)makeButton:(NSString*)title action:(SEL)action primary:(BOOL)primary
{
    UIButton* button = [UIButton buttonWithType:UIButtonTypeSystem];
    [button setTitle:title forState:UIControlStateNormal];
    button.titleLabel.font = [UIFont systemFontOfSize:13 weight:UIFontWeightBlack];
    button.layer.cornerRadius = 12.0;
    button.contentEdgeInsets = UIEdgeInsetsMake (12, 8, 12, 8);

    if (primary)
    {
        button.backgroundColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:1.0];
        [button setTitleColor:[UIColor colorWithRed:0.008 green:0.067 blue:0.067 alpha:1.0] forState:UIControlStateNormal];
    }
    else
    {
        button.backgroundColor = [UIColor colorWithWhite:1.0 alpha:0.08];
        [button setTitleColor:[UIColor colorWithWhite:0.92 alpha:1.0] forState:UIControlStateNormal];
        button.layer.borderWidth = 1.0;
        button.layer.borderColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:0.22].CGColor;
    }

    [button addTarget:self action:action forControlEvents:UIControlEventTouchUpInside];
    return button;
}

- (void)playTapped
{
    NSError* error = nil;
    if ([self.audioEngine startAndReturnError:&error])
    {
        self.statusLabel.text = @"Audio: playing";
        [self.audioEngine resetPlayback];
    }
    else
    {
        self.statusLabel.text = [NSString stringWithFormat:@"Audio error: %@", error.localizedDescription ?: @"unknown"];
    }
}

- (void)stopTapped
{
    [self.audioEngine stop];
    self.statusLabel.text = @"Audio: stopped";
}

- (void)generateTapped
{
    engine_.triggerEvent ("generate", 1.0);
    [self.audioEngine resetPlayback];
    [self refreshPatternText:@"Generated new melody."];
}

- (void)mutateTapped
{
    engine_.triggerEvent ("mutate", 1.0);
    [self.audioEngine resetPlayback];
    [self refreshPatternText:@"Mutated current melody."];
}

- (void)clearTapped
{
    engine_.triggerEvent ("clearPattern", 1.0);
    [self.audioEngine resetPlayback];
    [self refreshPatternText:@"Cleared pattern."];
}

- (NSString*)midiNoteName:(int)note
{
    static NSArray<NSString*>* names;
    static dispatch_once_t onceToken;
    dispatch_once (&onceToken, ^{
        names = @[ @"C", @"C#", @"D", @"D#", @"E", @"F", @"F#", @"G", @"G#", @"A", @"A#", @"B" ];
    });

    int index = note % 12;
    if (index < 0) index += 12;
    int octave = (note / 12) - 1;
    return [NSString stringWithFormat:@"%@%d", names[(NSUInteger) index], octave];
}

- (void)refreshPatternText:(NSString*)headline
{
    std::ostringstream os;
    os << [headline UTF8String] << "\n\n";
    os << "Step | Note | On | Glide | Random\n";
    os << "-----+------+----+-------+--------\n";

    for (int i = 0; i < LogicalChaosEngine::kMaxSteps; ++i)
    {
        const auto& s = engine_.getStep (i);
        NSString* noteName = [self midiNoteName:s.note];
        os.width (4);
        os << (i + 1) << " | ";
        os.width (4);
        os << [noteName UTF8String] << " |  ";
        os << (s.active ? "Y" : "-") << " |   ";
        os << (s.glide ? "Y" : "-") << "   |   ";
        os << (s.randomise ? "Y" : "-") << "\n";
    }

    self.patternView.text = [NSString stringWithUTF8String:os.str().c_str()];
}

@end
