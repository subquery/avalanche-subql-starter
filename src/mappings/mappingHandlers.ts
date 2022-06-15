import { BigInt as BigIntGraph} from "@graphprotocol/graph-ts";
import {
  Expedition,
  FinishCampaign,
  OwnershipTransferred,
  Participate,
  Paused,
  ReinforceAttack,
  ReinforceDefense,
  UnlockAttackNFTs,
  Unpaused,
} from "./utils";
import { Campaign, Hero, HeroCampaign } from "../types";
import {AvalancheLog} from "@subql/types-avalanche";

export async function handleParticipate(avaxEvent: AvalancheLog): Promise<void> {
  const event = avaxEvent.args;
  // Connect to the Expedition contract
  let expedition: Expedition = Expedition.bind(event.address);

  // Get tokens from event data
  const tokens: BigIntGraph[] = event.params._tokenIds;

  // Load campaign record
  let campaign = await Campaign.get(event.params._id.toString());

  // If the campaign does not exist create it with the campaign id
  if (!campaign) {
    campaign = new Campaign(event.params._id.toString());
  }

  let _reinforceTimestamps = campaign.reinforceTimestamps;

  // Get all the tokens
  for (let i = 0; i < tokens.length; i++) {
    const tokenId = tokens[i];
    let hero = await Hero.get(tokenId.toString());

    // If the hero doesn't exist create the details
    if (!hero) {
      hero = new Hero(tokenId.toString());

      hero.level = BigInt(expedition.getNFTLevel(tokenId).toString());
      hero.attack = BigInt(expedition.getNFTAttack(tokenId).toString());
      hero.defense = BigInt(expedition.getNFTDefense(tokenId).toString());
      hero.endurance = BigInt(expedition.getNFTEndurance(tokenId).toString());

      hero.save();
    }

    // Create the heroCampaign record
    let heroCampaign = new HeroCampaign(
      event.transaction.hash.toHex() + "-" + event.logIndex.toString() + "-" + tokenId.toString()
    );
    heroCampaign.heroId = hero.id;
    heroCampaign.campaignId = campaign.id;

    // not maker
    heroCampaign.isAmbusher = !event.params._isMaker;

    heroCampaign.save();

    // Set campaign timestamps for each token
    _reinforceTimestamps.push(event.block.timestamp)
  }

  // Note: In the time event fired tier & area have already values so it's safe to retrieve here
  // Get campaign details from blockchain
  const campaignDetails = expedition.campaigns(event.params._id);

  // Set tier and area info
  campaign.tier = BigInt(campaignDetails.value1.toString());
  campaign.area = BigInt(campaignDetails.value4.toString());

  // if isMaker assign the sender as campaigner
  // store the tokens of campaigner or ambusher
  if (event.params._isMaker) {
    campaign.campaigner = event.params._sender.toString();
    // set total defense
    campaign.totalDefense = BigInt(event.params._points.toString());

    // add timestamp
    campaign.startTimestamp = BigInt(event.block.timestamp.toString());
  } else {
    campaign.ambusher = event.params._sender.toString();
    // set total attack
    campaign.totalAttack = BigInt(event.params._points.toString());
  }


  campaign.reinforceTimestamps = _reinforceTimestamps;
  campaign.save();
}

// export function handleFinishCampaign(event: FinishCampaign): void {
//   // Connect to the Expedition contract
//   let expedition: Expedition = Expedition.bind(event.address);

//   const rewardMultiplier: BigInt = expedition.rewardMultiplier();
//   const loserRewardMultiplier: BigInt = BigInt.fromU32(10000).minus(rewardMultiplier);

//   // Load campaign record
//   let campaign = Campaign.load(event.params._id.toString());

//   // If the campaign does not exist create it with the campaign id
//   if (!campaign) {
//     campaign = new Campaign(event.params._id.toString());
//   }

//   // Caller is the maker
//   // Set is claimed for the campaigner
//   campaign.isClaimedCampaigner = true;

//   // campaigner is the winner
//   if (event.params._winner === event.params._sender) {
//     campaign.rewardHonCampaigner = event.params._honReward;
//     campaign.rewardHrmCampaigner = event.params._hrmReward;
//     campaign.rewardHonAmbusher = BigInt.zero();
//     campaign.rewardHrmAmbusher = BigInt.zero();
//   } else {
//     // ambusher is the winner
//     campaign.rewardHonCampaigner = event.params._honReward
//       .times(loserRewardMultiplier)
//       .div(BigInt.fromU32(10000));
//     campaign.rewardHrmCampaigner = event.params._hrmReward
//       .times(loserRewardMultiplier)
//       .div(BigInt.fromU32(10000));
//     campaign.rewardHonAmbusher = event.params._honReward
//       .times(rewardMultiplier)
//       .div(BigInt.fromU32(10000));
//     campaign.rewardHrmAmbusher = event.params._hrmReward
//       .times(rewardMultiplier)
//       .div(BigInt.fromU32(10000));
//   }

//   campaign.save();
// }

// export async function handleUnlockAttackNFTs(event: UnlockAttackNFTs): Promise<void> {
//   // Load campaign record
//   let campaign = await Campaign.get(event.params._id.toString());

//   // If the campaign does not exist create it with the campaign id
//   if (!campaign) {
//     campaign = new Campaign(event.params._id.toString());
//   }

//   // Set is claimed for the ambusher
//   campaign.isClaimedAmbusher = true;

//   campaign.save();
// }

// export async function handleReinforceAttack(event: ReinforceAttack): Promise<void> {
//   // Connect to the Expedition contract
//   let expedition: Expedition = Expedition.bind(event.address);

//   // Load campaign record
//   let campaign = await Campaign.get(event.params._id.toString());

//   // If the campaign does not exist create it with the campaign id
//   if (!campaign) {
//     campaign = new Campaign(event.params._id.toString());
//   }

//   let hero = await Hero.get(event.params._tokenId.toString());

//   // If hero does not exist create it
//   if (!hero) {
//     hero = new Hero(event.params._tokenId.toString());

//     hero.level = expedition.getNFTLevel(event.params._tokenId);
//     hero.attack = expedition.getNFTAttack(event.params._tokenId);
//     hero.defense = expedition.getNFTDefense(event.params._tokenId);
//     hero.endurance = expedition.getNFTEndurance(event.params._tokenId);

//     hero.save();
//   }

//   // set the total attack points
//   campaign.totalAttack = event.params._points;

//   // Set campaign reinforcement timestamp
//   let _reinforceTimestamps = campaign.reinforceTimestamps;
//   _reinforceTimestamps.push(event.block.timestamp);

//   // Create the heroCampaign record
//   let heroCampaign = new HeroCampaign(
//     event.transaction.hash.toHex() + "-" + event.logIndex.toString()
//   );
//   heroCampaign.heroId = hero.id;
//   heroCampaign.campaignId = campaign.id;

//   // ambusher only calls reinforceAttack
//   heroCampaign.isAmbusher = true;

//   heroCampaign.save();

//   campaign.reinforceTimestamps = _reinforceTimestamps;
//   campaign.save();
// }

// export async function handleReinforceDefense(event: ReinforceDefense): Promise<void> {
//   // Connect to the Expedition contract
//   let expedition: Expedition = Expedition.bind(event.address);

//   // Load campaign record
//   let campaign = await Campaign.get(event.params._id.toString());

//   // If the campaign does not exist create it with the campaign id
//   if (!campaign) {
//     campaign = new Campaign(event.params._id.toString());
//   }

//   let hero = await Hero.get(event.params._tokenId.toString());

//   // If hero does not exist create it
//   if (!hero) {
//     hero = new Hero(event.params._tokenId.toString());

//     hero.level = expedition.getNFTLevel(event.params._tokenId);
//     hero.attack = expedition.getNFTAttack(event.params._tokenId);
//     hero.defense = expedition.getNFTDefense(event.params._tokenId);
//     hero.endurance = expedition.getNFTEndurance(event.params._tokenId);

//     hero.save();
//   }

//   // set the total defense points
//   campaign.totalDefense = event.params._points;

//   // Set campaign reinforcement timestamp
//   let _reinforceTimestamps = campaign.reinforceTimestamps;
//   _reinforceTimestamps.push(event.block.timestamp);

//   // Create the heroCampaign record
//   let heroCampaign = new HeroCampaign(
//     event.transaction.hash.toHex() + "-" + event.logIndex.toString()
//   );
//   heroCampaign.heroId = hero.id;
//   heroCampaign.campaignId = campaign.id;

//   // campaigner only calls reinforceDefense
//   heroCampaign.isAmbusher = false;

//   heroCampaign.save();

//   campaign.reinforceTimestamps = _reinforceTimestamps;
//   campaign.save();
// }

// export function handleOwnershipTransferred(event: OwnershipTransferred): void {}

// export function handlePaused(event: Paused): void {}

// export function handleUnpaused(event: Unpaused): void {}
